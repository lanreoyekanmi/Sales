import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sharp from "sharp";

dotenv.config({ path: ".env" });

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

function buildApplicationForm() {
  const form = new FormData();
  form.append("data", JSON.stringify(validData()));
  for (const field of ["idCardImage", "ssnCardImage", "selfieImage"]) {
    form.append(field, new Blob([validJpegBuffer], { type: "image/jpeg" }), `${field}.jpg`);
  }
  return form;
}

// The Cloudinary Node SDK rejects with a plain object, not an Error instance — the real
// message lives at err.error.message/err.error.http_code, not err.message.
function isCloudinaryNotFound(err) {
  return err?.error?.http_code === 404;
}

async function postForm(path, form) {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", body: form });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

// Pass `null` (not `undefined`) to deliberately omit a field — default-parameter destructuring
// would otherwise replace an explicit `undefined` with the default, defeating the "missing
// field" test cases below.
function buildDocumentForm(opts = {}) {
  const kind = "kind" in opts ? opts.kind : "selfie";
  const image = "image" in opts ? opts.image : validJpegBuffer;
  const form = new FormData();
  if (kind !== null) form.append("kind", kind);
  if (image !== null) form.append("image", new Blob([image], { type: "image/jpeg" }), "image.jpg");
  return form;
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

  const created = await postForm("/api/applications", buildApplicationForm());
  applicationId = created.json.applicationId;
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
    const { status, json } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ kind: "selfie" })
    );
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

    const { status } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ kind: "id_card" })
    );
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

    const { status, json } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ kind: "selfie" })
    );
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

    const { status, json } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ image: tiny })
    );
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IMAGE");
  });

  test("rejects an invalid kind", async () => {
    const { status, json } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ kind: "passport" })
    );
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a request with no image file", async () => {
    const { status, json } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ image: null })
    );
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a non-image file disguised as an image", async () => {
    const { status, json } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ image: Buffer.from("not an image") })
    );
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IMAGE");
  });

  test("rejects an oversized image", async () => {
    const { status } = await postForm(
      `/api/applications/${applicationId}/documents`,
      buildDocumentForm({ image: Buffer.alloc(9 * 1024 * 1024, 0xff) })
    );
    assert.equal(status, 413);
  });

  test("returns 404 for a well-formed but unknown applicationId", async () => {
    const { status, json } = await postForm(
      `/api/applications/${randomUUID()}/documents`,
      buildDocumentForm()
    );
    assert.equal(status, 404);
    assert.equal(json.code, "APPLICATION_NOT_FOUND");
  });

  test("returns the same 404 for a malformed applicationId (no distinguishing signal)", async () => {
    const { status, json } = await postForm(
      `/api/applications/not-a-uuid/documents`,
      buildDocumentForm()
    );
    assert.equal(status, 404);
    assert.equal(json.code, "APPLICATION_NOT_FOUND");
  });
});
