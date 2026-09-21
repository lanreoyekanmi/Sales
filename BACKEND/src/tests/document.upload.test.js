import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sharp from "sharp";
import { generateApplicationId } from "../utils/applicationId.js";

dotenv.config({ path: ".env" });

// This file's before() creates a real application via a real successful submission and never
// mocks telegramNotifier — with the real TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID from .env still
// set, that submission would otherwise send a real notification to the real Telegram channel.
// Telegram's own behavior is covered in telegram.service.test.js and telegram.notification.test.js.
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

process.env.APPLICATION_RATE_LIMIT_MAX = "1000";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX = "1000";

// Node's test runner executes test files concurrently by default, and application.api.test.js
// makes count-based assertions against "Sales_test" — a distinct database name keeps this
// file's writes from racing with those counts.
const TEST_DB_NAME = "Sales_test_documents";

// See application.api.test.js for why this is needed: cloudinaryStorage.adapter.js reads this
// env var once at import time, so it must be set before app.js is imported below. Cleaned up
// in its entirety in after().
const uploadFolder = `loan-applications-test/${randomUUID()}`;
process.env.CLOUDINARY_UPLOAD_FOLDER = uploadFolder;

let app;
let Application;
let IdempotencyKey;
let cloudinary;
let cloudinaryStorage;
let server;
let baseUrl;
let validJpegBuffer;
let applicationId;

function validData() {
  return {
    applicant: {
      firstName: "Jane",
      lastName: "Doe",
      email: `jane+${randomUUID()}@example.com`,
      phoneNumber: "+1 555-123-4567",
      dateOfBirth: "1990-01-01",
      residentialAddress: "123 Main St",
      city: "Springfield",
      state: "IL",
    },
    employment: {
      employmentStatus: "employed",
      employerName: "Acme Corp",
      monthlyIncome: 4500,
      incomeFrequency: "monthly",
    },
    loanRequest: {
      requestedLoanAmount: 10000,
      loanPurpose: "Home renovation",
      preferredRepaymentPeriodMonths: 24,
      repaymentFrequency: "monthly",
    },
    loanHistory: [],
    disbursement: {
      preferredMethod: "direct_deposit",
      bankDetails: {
        accountHolderName: "Jane Doe",
        bankRoutingNumber: "011401533",
        accountNumber: "1234567890",
        accountType: "checking",
        bankType: "bank",
      },
    },
    consent: { termsAccepted: true, dataProcessingAccepted: true },
  };
}

// The Cloudinary Node SDK rejects with a plain object, not an Error instance — the real
// message lives at err.error.message/err.error.http_code, not err.message.
function isCloudinaryNotFound(err) {
  return err?.error?.http_code === 404;
}

async function apiPost(path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

// Mirrors the real browser flow (see FRONTEND/src/api/applications.ts): upload the raw file
// directly to Cloudinary using a signed target obtained from our own API.
async function uploadToCloudinaryDirect(buffer, target) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/jpeg" }), "file.jpg");
  form.append("api_key", target.apiKey);
  form.append("timestamp", String(target.timestamp));
  form.append("signature", target.signature);
  form.append("public_id", target.publicId);
  form.append("type", target.type);
  form.append("overwrite", String(target.overwrite));
  form.append("invalidate", String(target.invalidate));

  const res = await fetch(target.uploadUrl, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary direct upload failed (${res.status}): ${text}`);
  }
}

async function initAndStageApplication() {
  const { json: init } = await apiPost("/api/applications/uploads/init", {});
  for (const field of ["idCardImage", "ssnCardImage", "selfieImage"]) {
    await uploadToCloudinaryDirect(validJpegBuffer, init.uploads[field]);
  }
  return init.applicationId;
}

async function createApplication() {
  const id = await initAndStageApplication();
  const { json } = await apiPost("/api/applications", { ...validData(), applicationId: id });
  return json.applicationId;
}

// Step 1 of a retake: returns the init response's `upload` target (or the full response, for
// tests that expect init itself to fail). `image: null` deliberately skips the real Cloudinary
// upload — simulates "the client called init but never actually uploaded anything".
async function stageRetake(id, kind, image = validJpegBuffer) {
  const initRes = await apiPost(`/api/applications/${id}/documents/init`, { kind });
  if (initRes.status === 201 && image !== null) {
    await uploadToCloudinaryDirect(image, initRes.json.upload);
  }
  return initRes;
}

function confirmRetake(id, kind) {
  return apiPost(`/api/applications/${id}/documents`, { kind });
}

async function retakeDocument(id, { kind = "selfie", image = validJpegBuffer } = {}) {
  const initRes = await stageRetake(id, kind, image);
  if (initRes.status !== 201) return initRes;
  return confirmRetake(id, kind);
}

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run document.upload.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  ({ default: app } = await import("../app.js"));
  ({ default: Application } = await import("../models/application.model.js"));
  ({ default: IdempotencyKey } = await import("../models/idempotencyKey.model.js"));
  ({ default: cloudinary } = await import("../config/cloudinary.js"));
  ({ cloudinaryStorage } = await import("../services/cloudinaryStorage.adapter.js"));

  validJpegBuffer = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 5, g: 5, b: 5 } },
  })
    .jpeg()
    .toBuffer();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  applicationId = await createApplication();
});

after(async () => {
  await Application.deleteMany({});
  await IdempotencyKey.deleteMany({});
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
  await cloudinary.api.delete_resources_by_prefix(uploadFolder, { resource_type: "image", type: "authenticated" });
});

describe("POST /api/applications/:applicationId/documents", () => {
  test("replaces an existing document of the given kind rather than duplicating it", async () => {
    const { status, json } = await retakeDocument(applicationId, { kind: "selfie" });
    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.equal(json.kind, "selfie");
    assert.deepEqual(Object.keys(json).sort(), ["kind", "message", "success"]);

    const stored = await Application.findOne({ applicationId }).lean();
    assert.equal(stored.documents.filter((d) => d.kind === "selfie").length, 1);
    assert.equal(stored.documents.length, 3, "the other two documents must be untouched");
    const selfieDoc = stored.documents.find((d) => d.kind === "selfie");
    assert.equal(selfieDoc.deliveryType, "authenticated");
    assert.equal(selfieDoc.publicId, undefined, "select: false field must not leak by default");
  });

  test("successfully replacing a document uploads to a fresh public_id and deletes the previous asset", async () => {
    const before = await Application.findOne({ applicationId }).select("+documents.publicId").lean();
    const previousPublicId = before.documents.find((d) => d.kind === "id_card").publicId;

    const { status } = await retakeDocument(applicationId, { kind: "id_card" });
    assert.equal(status, 201);

    const after = await Application.findOne({ applicationId }).select("+documents.publicId").lean();
    const newPublicId = after.documents.find((d) => d.kind === "id_card").publicId;
    assert.notEqual(newPublicId, previousPublicId, "a retake must not overwrite the same public_id in place");

    await assert.rejects(
      cloudinary.api.resource(previousPublicId, { resource_type: "image", type: "authenticated" }),
      isCloudinaryNotFound,
      "the previous asset should have been deleted once the replacement committed"
    );
  });

  test("a failed MongoDB update during a retake preserves the previous asset and metadata, and rolls back the new upload", async (t) => {
    const before = await Application.findOne({ applicationId }).select("+documents.publicId").lean();
    const previousDoc = before.documents.find((d) => d.kind === "selfie");

    await stageRetake(applicationId, "selfie");

    let uploadedPublicId;
    const realUpload = cloudinaryStorage.uploadDocumentFile.bind(cloudinaryStorage);
    t.mock.method(cloudinaryStorage, "uploadDocumentFile", async (args) => {
      const result = await realUpload(args);
      uploadedPublicId = result.publicId;
      return result;
    });
    t.mock.method(Application, "updateOne", async () => {
      throw new Error("simulated MongoDB outage");
    });

    const { status, json } = await confirmRetake(applicationId, "selfie");
    assert.equal(status, 500);
    assert.equal(json.code, "INTERNAL_ERROR");
    assert.ok(!("stack" in json));

    const after = await Application.findOne({ applicationId }).select("+documents.publicId").lean();
    const afterDoc = after.documents.find((d) => d.kind === "selfie");
    assert.deepEqual(afterDoc, previousDoc, "previous document metadata must be byte-for-byte untouched after a failed write");

    await assert.rejects(
      cloudinary.api.resource(uploadedPublicId, { resource_type: "image", type: "authenticated" }),
      isCloudinaryNotFound,
      "the new upload must be rolled back when the MongoDB write fails"
    );

    const stillThere = await cloudinary.api.resource(previousDoc.publicId, {
      resource_type: "image",
      type: "authenticated",
    });
    assert.equal(stillThere.public_id, previousDoc.publicId, "the previous asset must still exist, untouched");
  });

  test("rejects an image smaller than the minimum allowed dimensions", async () => {
    const tiny = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const { status, json } = await retakeDocument(applicationId, { kind: "selfie", image: tiny });
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IMAGE");
  });

  test("rejects an invalid kind", async () => {
    const { status, json } = await apiPost(`/api/applications/${applicationId}/documents/init`, { kind: "passport" });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a request with no image ever uploaded", async () => {
    const { status, json } = await retakeDocument(applicationId, { kind: "selfie", image: null });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a non-image file disguised as an image", async (t) => {
    await apiPost(`/api/applications/${applicationId}/documents/init`, { kind: "selfie" });
    t.mock.method(cloudinaryStorage, "fetchStagedUpload", async () => ({
      buffer: Buffer.from("not an image"),
      bytes: 13,
    }));

    const { status, json } = await confirmRetake(applicationId, "selfie");
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IMAGE");
  });

  test("rejects an oversized image", async (t) => {
    await apiPost(`/api/applications/${applicationId}/documents/init`, { kind: "selfie" });
    t.mock.method(cloudinaryStorage, "fetchStagedUpload", async () => ({
      buffer: Buffer.alloc(1024, 0xff),
      bytes: 9 * 1024 * 1024,
    }));

    const { status } = await confirmRetake(applicationId, "selfie");
    assert.equal(status, 413);
  });

  test("returns 404 for a well-formed but unknown applicationId", async () => {
    const { status, json } = await apiPost(`/api/applications/${randomUUID()}/documents/init`, { kind: "selfie" });
    assert.equal(status, 404);
    assert.equal(json.code, "APPLICATION_NOT_FOUND");
  });

  test("returns the same 404 for a malformed applicationId (no distinguishing signal)", async () => {
    const { status, json } = await apiPost("/api/applications/not-a-uuid/documents/init", { kind: "selfie" });
    assert.equal(status, 404);
    assert.equal(json.code, "APPLICATION_NOT_FOUND");
  });

  test("returns 404 for a well-formed but unknown applicationId in the current LN- format", async () => {
    const { status, json } = await apiPost(`/api/applications/${generateApplicationId()}/documents/init`, {
      kind: "selfie",
    });
    assert.equal(status, 404);
    assert.equal(json.code, "APPLICATION_NOT_FOUND");
  });

  test("supports retaking a document on a legacy UUID-format application (backward compatibility)", async () => {
    // Simulates an application created before the LN-YYYYMMDD-XXXXXXX format existed: its
    // applicationId is still a crypto.randomUUID() value, and the retake endpoint must keep
    // routing to it exactly as it did before that format was introduced.
    const legacyId = randomUUID();
    await new Application({
      applicationId: legacyId,
      applicant: {
        firstName: "Legacy",
        lastName: "User",
        email: `legacy+${randomUUID()}@example.com`,
        phoneNumber: "+1 555-000-0000",
        dateOfBirth: new Date("1985-05-05"),
        residentialAddress: "1 Old St",
        city: "Oldtown",
        state: "OT",
      },
      employment: { employmentStatus: "unemployed" },
      loanRequest: {
        requestedLoanAmount: 500,
        loanPurpose: "legacy application backward-compatibility test",
        preferredRepaymentPeriodMonths: 6,
        repaymentFrequency: "monthly",
      },
      disbursement: {
        preferredMethod: "direct_deposit",
        bankDetails: {
          accountHolderName: "Legacy User",
          bankRoutingNumber: "011401533",
          accountNumber: "1234567890",
          accountType: "checking",
          bankType: "bank",
        },
      },
      documents: ["id_card", "ssn_card", "selfie"].map((kind) => ({
        kind,
        publicId: `${uploadFolder}/${legacyId}/${kind}-legacy`,
        resourceType: "image",
        deliveryType: "authenticated",
        format: "jpg",
        bytes: 1,
      })),
      consent: { termsAccepted: true, dataProcessingAccepted: true },
      metadata: {},
    }).save();

    const { status, json } = await retakeDocument(legacyId, { kind: "selfie" });
    assert.equal(status, 201);
    assert.equal(json.success, true);

    const stored = await Application.findOne({ applicationId: legacyId }).lean();
    assert.equal(stored.documents.length, 3, "the other two legacy documents must be untouched");
    const selfieDoc = stored.documents.find((d) => d.kind === "selfie");
    assert.equal(selfieDoc.deliveryType, "authenticated");
  });
});
