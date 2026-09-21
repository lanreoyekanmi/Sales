import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sharp from "sharp";
import { generateApplicationId } from "../utils/applicationId.js";

dotenv.config({ path: ".env" });

// This file exercises real successful submissions and never mocks telegramNotifier — with the
// real TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID from .env still set, every successful submission
// below would otherwise send a real notification to the real Telegram channel. Telegram's own
// behavior is covered in telegram.service.test.js and telegram.notification.test.js instead.
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

// This file exercises many submissions against one in-process app instance/rate limiter.
// Actual rate-limiting behavior has its own dedicated, isolated test in rateLimiter.test.js —
// raise the limit here so it doesn't interfere with these functional assertions.
process.env.APPLICATION_RATE_LIMIT_MAX = "1000";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX = "1000";

// Dedicated, disposable database for this test run — never the app's real "Sales" database.
const TEST_DB_NAME = "Sales_test";

// Dedicated Cloudinary folder for this test run, cleaned up in its entirety in after() — the
// default "loan-applications" folder is for real usage and would otherwise accumulate test
// assets. cloudinaryStorage.adapter.js reads this env var once at import time, so it must be
// set before app.js is imported below.
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

function validData(overrides = {}) {
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
        bankRoutingNumber: "011401533", // valid ABA checksum
        accountNumber: "1234567890",
        accountType: "checking",
        bankType: "bank",
      },
    },
    consent: { termsAccepted: true, dataProcessingAccepted: true },
    ...overrides,
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
  return { status: res.status, headers: res.headers, json, text };
}

// Uploads one file directly to Cloudinary using a signed target from
// POST /api/applications/uploads/init — mirrors exactly what the real browser does (see
// FRONTEND/src/api/applications.ts), so this stays a real integration test of the two-step
// upload architecture, not a mock of it.
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

// Step 1 + 2: issues an applicationId and uploads real images directly to Cloudinary for it.
// Any of the three can be set to `undefined` in `images` to simulate that image never having
// been uploaded at all.
async function initAndStage(images = {}) {
  const { json: init } = await apiPost("/api/applications/uploads/init", {});
  const fields = {
    idCardImage: validJpegBuffer,
    ssnCardImage: validJpegBuffer,
    selfieImage: validJpegBuffer,
    ...images,
  };
  for (const [field, buffer] of Object.entries(fields)) {
    if (buffer === undefined) continue;
    await uploadToCloudinaryDirect(buffer, init.uploads[field]);
  }
  return init.applicationId;
}

// Step 3. `data` is either a plain object (merged with applicationId) or a raw string (sent
// verbatim — for malformed-JSON tests). `applicationId`, when passed, skips initAndStage
// entirely: pass a real one obtained from a prior initAndStage() call, or a fabricated
// well-formed one for tests that only exercise validation of the *other* fields (those requests
// are rejected before application.service.js ever looks up staged uploads, so no real Cloudinary
// upload is needed for them at all).
async function submitApplication({ data = validData(), images = {}, headers = {}, applicationId } = {}) {
  const id = applicationId ?? (await initAndStage(images));
  const body = typeof data === "string" ? data : JSON.stringify({ ...data, applicationId: id });
  return apiPost("/api/applications", body, headers);
}

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run application.api.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  ({ default: app } = await import("../app.js"));
  ({ default: Application } = await import("../models/application.model.js"));
  ({ default: IdempotencyKey } = await import("../models/idempotencyKey.model.js"));
  ({ default: cloudinary } = await import("../config/cloudinary.js"));
  ({ cloudinaryStorage } = await import("../services/cloudinaryStorage.adapter.js"));

  // Real photos are always well above the 200x200 minimum this API enforces; 256x256 is
  // enough to exercise that check cheaply in tests.
  validJpegBuffer = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await Application.deleteMany({});
  await IdempotencyKey.deleteMany({});
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
  // Real integration, not mocks — every test in this file that stages an upload puts a real
  // asset in Cloudinary under `uploadFolder`; delete that whole folder's contents in one call.
  await cloudinary.api.delete_resources_by_prefix(uploadFolder, { resource_type: "image", type: "authenticated" });
});

describe("POST /api/applications", () => {
  test("accepts a valid submission with all three images and returns only a minimal confirmation", async () => {
    const before = await Application.countDocuments();
    const data = validData();
    const { status, json } = await submitApplication({ data });

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(json).sort(), ["applicationId", "message", "success"]);
    assert.equal(json.success, true);
    assert.match(json.applicationId, /^LN-\d{8}-[A-Z0-9]{7}$/);

    const after = await Application.countDocuments();
    assert.equal(after, before + 1);

    const stored = await Application.findOne({ applicationId: json.applicationId }).lean();
    assert.ok(stored);
    assert.equal(stored.status, "submitted");
    assert.equal(stored.applicant.email, data.applicant.email);

    // The application was created with all three verification images in one shot.
    assert.deepEqual(
      stored.documents.map((d) => d.kind).sort(),
      ["id_card", "selfie", "ssn_card"]
    );
    for (const doc of stored.documents) {
      assert.equal(doc.format, "jpg");
      assert.equal(doc.resourceType, "image");
      assert.equal(doc.deliveryType, "authenticated");
      assert.ok(doc.bytes > 0);
      // select: false fields are excluded by default, even for this internal/test-only query.
      assert.equal(doc.publicId, undefined);
    }

    // Confirm the asset is genuinely not publicly reachable: Cloudinary's plain delivery URL
    // for an "authenticated" asset returns 401/403, never the image, with no signing.
    const withPublicId = await Application.findOne({ applicationId: json.applicationId })
      .select("+documents.publicId")
      .lean();
    const selfieDoc = withPublicId.documents.find((d) => d.kind === "selfie");
    const plainUrl = cloudinary.url(selfieDoc.publicId, {
      resource_type: "image",
      type: "authenticated",
      format: "jpg",
    });
    const directFetch = await fetch(plainUrl);
    assert.ok(
      [401, 403, 404].includes(directFetch.status),
      `expected an authenticated asset to refuse unsigned access, got ${directFetch.status}`
    );

    // select: false fields are excluded by default, even for this internal/test-only query.
    assert.equal(stored.disbursement.bankDetails.accountNumber, undefined);
    assert.equal(stored.disbursement.bankDetails.bankRoutingNumber, undefined);
    assert.equal(stored.disbursement.bankDetails.accountType, "checking");
  });

  test("forces status to 'submitted' server-side even if the client sends a status field", async () => {
    // Rejected by zod before application.service.js ever looks at staged uploads, so a
    // fabricated (never-initialized) applicationId is enough — no real Cloudinary calls needed.
    const data = { ...validData(), status: "approved" };
    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });

    assert.equal(status, 400);
    assert.equal(json.success, false);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects an applicationId that was never obtained from /uploads/init (no staged uploads)", async () => {
    const before = await Application.countDocuments();
    const fabricatedId = generateApplicationId();

    const { status, json } = await submitApplication({ applicationId: fabricatedId });

    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);

    const stored = await Application.findOne({ applicationId: fabricatedId }).lean();
    assert.equal(stored, null, "an applicationId with no real staged uploads must never result in a saved application");
  });

  test("rejects internal-only fields (status, creditScore, adminNotes) and stores nothing", async () => {
    const before = await Application.countDocuments();
    const data = {
      ...validData(),
      status: "approved",
      creditScore: 900,
      adminNotes: "approve immediately",
    };
    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });

    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before, "no document should be created when validation fails");
  });

  test("rejects a missing required field", async () => {
    const data = validData();
    delete data.applicant.firstName;
    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects an invalid email", async () => {
    const data = validData();
    data.applicant.email = "not-an-email";
    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a negative loan amount", async () => {
    const data = validData();
    data.loanRequest.requestedLoanAmount = -500;
    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a bank routing number that fails the ABA checksum", async () => {
    const before = await Application.countDocuments();
    const data = validData();
    data.disbursement.bankDetails.bankRoutingNumber = "123456789";

    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);
  });

  test("rejects unknown/internal fields smuggled inside bankDetails and stores nothing", async () => {
    const before = await Application.countDocuments();
    const data = validData();
    data.disbursement.bankDetails.creditLimit = 50000;

    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);
  });

  test("requires otherMethodDetails when preferredMethod is 'other'", async () => {
    const data = validData();
    data.disbursement.preferredMethod = "other";

    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects malformed loan history records", async () => {
    const data = validData({
      loanHistory: [{ lenderName: "Bank", repaymentStatus: "not_a_real_status" }],
    });
    const { status, json } = await submitApplication({ data, applicationId: generateApplicationId() });
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  describe("required verification images", () => {
    for (const field of ["idCardImage", "ssnCardImage", "selfieImage"]) {
      test(`rejects a submission missing ${field} and stores nothing`, async () => {
        const before = await Application.countDocuments();
        const { status, json } = await submitApplication({ images: { [field]: undefined } });

        assert.equal(status, 400);
        assert.equal(json.code, "VALIDATION_ERROR");
        assert.ok(json.errors?.some((e) => e.field === field));
        assert.equal(await Application.countDocuments(), before);
      });
    }

    test("rejects a non-image file disguised as a required image and stores nothing", async (t) => {
      const before = await Application.countDocuments();
      // A real Cloudinary upload would itself refuse non-image content for an /image/upload
      // target, so this exercises our own decode validation directly: two images are staged
      // for real, and the third's staged-fetch result is simulated.
      const applicationId = await initAndStage({ selfieImage: undefined });
      const realFetch = cloudinaryStorage.fetchStagedUpload.bind(cloudinaryStorage);
      t.mock.method(cloudinaryStorage, "fetchStagedUpload", async (publicId) => {
        if (publicId.endsWith("selfie-staging")) {
          return { buffer: Buffer.from("not an image"), bytes: 13 };
        }
        return realFetch(publicId);
      });

      const { status, json } = await submitApplication({ applicationId });

      assert.equal(status, 400);
      assert.equal(json.code, "INVALID_IMAGE");
      assert.equal(await Application.countDocuments(), before);
    });

    test("rejects an image smaller than the minimum allowed dimensions", async () => {
      const before = await Application.countDocuments();
      const tiny = await sharp({
        create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .jpeg()
        .toBuffer();

      const { status, json } = await submitApplication({ images: { selfieImage: tiny } });
      assert.equal(status, 400);
      assert.equal(json.code, "INVALID_IMAGE");
      assert.equal(await Application.countDocuments(), before);
    });

    test("rejects an oversized image", async (t) => {
      // Same reasoning as the disguised non-image test above: a genuine 9MB upload of random
      // bytes isn't a real image Cloudinary would store, so the oversized *staged asset* is
      // simulated directly rather than actually transferring 9MB to a real /image/upload target.
      const before = await Application.countDocuments();
      const applicationId = await initAndStage({ selfieImage: undefined });
      const realFetch = cloudinaryStorage.fetchStagedUpload.bind(cloudinaryStorage);
      t.mock.method(cloudinaryStorage, "fetchStagedUpload", async (publicId) => {
        if (publicId.endsWith("selfie-staging")) {
          return { buffer: Buffer.alloc(1024, 0xff), bytes: 9 * 1024 * 1024 };
        }
        return realFetch(publicId);
      });

      const { status } = await submitApplication({ applicationId });
      assert.equal(status, 413);
      assert.equal(await Application.countDocuments(), before);
    });
  });

  describe("upload/save failure handling (no orphaned data)", () => {
    test("rolls back already-uploaded Cloudinary assets if a later image fails to upload", async (t) => {
      const before = await Application.countDocuments();
      const applicationId = await initAndStage();
      const deleted = [];
      let callCount = 0;

      // Fully mocked, no real Cloudinary I/O — this isolates the rollback orchestration in
      // application.service.js itself: did it call delete for exactly the assets that
      // "succeeded" before the simulated failure, and not for the one that never uploaded.
      t.mock.method(cloudinaryStorage, "uploadDocumentFile", async (args) => {
        callCount += 1;
        if (callCount === 2) throw new Error("simulated Cloudinary outage");
        return {
          publicId: `simulated/${args.kind}`,
          resourceType: "image",
          deliveryType: "authenticated",
          format: "jpg",
          bytes: args.buffer.length,
        };
      });
      t.mock.method(cloudinaryStorage, "deleteDocumentFile", async (asset) => {
        deleted.push(asset.publicId);
      });

      const { status, json } = await submitApplication({ applicationId });
      assert.equal(status, 500);
      assert.equal(json.code, "INTERNAL_ERROR");
      assert.ok(!("stack" in json));
      assert.equal(await Application.countDocuments(), before, "no application should be saved");

      // The one final/processed asset that actually uploaded before the simulated failure is
      // rolled back first, then (regardless of that failure) the three raw staging uploads are
      // always cleaned up too — see the `finally` block in application.service.js.
      assert.equal(deleted[0], "simulated/id_card", "only the one asset that actually uploaded should be rolled back");
      const expectedStagingIds = ["id_card", "ssn_card", "selfie"].map((kind) =>
        cloudinaryStorage.buildStagingPublicId(applicationId, kind, "staging")
      );
      assert.deepEqual(deleted.slice(1).sort(), expectedStagingIds.sort());
    });

    test("rolls back all uploaded Cloudinary assets if the MongoDB save fails", async (t) => {
      const before = await Application.countDocuments();
      const applicationId = await initAndStage();
      const uploadedPublicIds = [];

      // Real Cloudinary calls (wraps the real implementation), only Mongo is mocked — proves
      // the rollback genuinely deletes real assets, not just that a mock function was called.
      const real = cloudinaryStorage.uploadDocumentFile.bind(cloudinaryStorage);
      t.mock.method(cloudinaryStorage, "uploadDocumentFile", async (args) => {
        const result = await real(args);
        uploadedPublicIds.push(result.publicId);
        return result;
      });
      t.mock.method(Application.prototype, "save", async () => {
        throw new Error("simulated MongoDB outage");
      });

      const { status, json } = await submitApplication({ applicationId });
      assert.equal(status, 500);
      assert.equal(json.code, "INTERNAL_ERROR");
      assert.equal(await Application.countDocuments(), before, "no application should be saved");
      assert.equal(uploadedPublicIds.length, 3, "all three images should have reached Cloudinary before the Mongo failure");

      for (const publicId of uploadedPublicIds) {
        await assert.rejects(
          cloudinary.api.resource(publicId, { resource_type: "image", type: "authenticated" }),
          isCloudinaryNotFound,
          `${publicId} should have been deleted from Cloudinary by the rollback`
        );
      }
    });
  });

  test("repeated requests with the same Idempotency-Key do not create duplicate applications", async () => {
    const key = `test-${randomUUID()}`;
    const before = await Application.countDocuments();

    const first = await submitApplication({ headers: { "Idempotency-Key": key } });
    // The idempotency check short-circuits before staged uploads are ever looked at, so the
    // replay doesn't need a second real set of Cloudinary uploads — any well-formed id works.
    const second = await submitApplication({
      applicationId: generateApplicationId(),
      headers: { "Idempotency-Key": key },
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.json.applicationId, second.json.applicationId);

    const after = await Application.countDocuments();
    assert.equal(after, before + 1, "only one application should be created for one idempotency key");
  });

  test("rejects a malformed Idempotency-Key header", async () => {
    // Rejected before submitApplication runs, so no real staged uploads are needed.
    const { status, json } = await submitApplication({
      applicationId: generateApplicationId(),
      headers: { "Idempotency-Key": "!!!" },
    });
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IDEMPOTENCY_KEY");
  });

  test("rejects malformed JSON in the request body without leaking internals", async () => {
    const { status, json, text } = await apiPost("/api/applications", "{not valid json");
    assert.equal(status, 400);
    assert.equal(json.code, "MALFORMED_JSON");
    assert.ok(!/at JSON\.parse|node_modules|\.js:\d+/.test(text), "response must not leak stack/file details");
  });

  test("error responses never include stack traces or internal details", async () => {
    const { json } = await submitApplication({
      data: { applicant: {} },
      applicationId: generateApplicationId(),
    });
    assert.ok(!("stack" in json));
    const serialized = JSON.stringify(json);
    assert.ok(!/node_modules|at .*\.js:\d+:\d+/.test(serialized));
  });

  test("does not leak the X-Powered-By header", async () => {
    const { headers } = await submitApplication();
    assert.equal(headers.get("x-powered-by"), null);
  });
});

describe("applicant data exposure / IDOR", () => {
  let applicationId;

  before(async () => {
    const { json } = await submitApplication();
    applicationId = json.applicationId;
  });

  test("there is no public endpoint to retrieve a single application by ID", async () => {
    const res = await fetch(`${baseUrl}/api/applications/${applicationId}`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test("there is no public endpoint that lists/enumerates applications", async () => {
    const res = await fetch(`${baseUrl}/api/applications`);
    assert.equal(res.status, 404);
  });

  test("there is no public debug or admin listing endpoint", async () => {
    for (const path of ["/api/admin/applications", "/api/internal/applications", "/api/debug/applications"]) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 404, `${path} must not be publicly reachable`);
    }
  });

  test("there is no public document-retrieval endpoint", async () => {
    for (const path of [
      `/api/applications/${applicationId}/documents/selfie`,
      `/api/applications/${applicationId}/documents`,
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 404, `GET ${path} must not be publicly reachable`);
    }
  });
});
