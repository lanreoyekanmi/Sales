import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sharp from "sharp";

dotenv.config({ path: ".env" });

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

// Builds the multipart/form-data body the real endpoint expects: a "data" JSON part plus the
// three required image parts. Any of the three can be overridden/omitted to exercise
// validation of the image requirement itself.
function buildFormData({ data = validData(), images = {} } = {}) {
  const form = new FormData();
  form.append("data", typeof data === "string" ? data : JSON.stringify(data));

  const fields = {
    idCardImage: validJpegBuffer,
    ssnCardImage: validJpegBuffer,
    selfieImage: validJpegBuffer,
    ...images,
  };
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue; // allows a test to omit a field entirely
    form.append(field, new Blob([value], { type: "image/jpeg" }), `${field}.jpg`);
  }
  return form;
}

// The Cloudinary Node SDK rejects with a plain object, not an Error instance — the real
// message lives at err.error.message/err.error.http_code, not err.message.
function isCloudinaryNotFound(err) {
  return err?.error?.http_code === 404;
}

async function postForm(path, form, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: form });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
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
  // Real integration, not mocks — every test in this file that succeeds uploads real assets
  // to Cloudinary under `uploadFolder`; delete that whole folder's contents in one call.
  await cloudinary.api.delete_resources_by_prefix(uploadFolder, { resource_type: "image", type: "authenticated" });
});

describe("POST /api/applications", () => {
  test("accepts a valid submission with all three images and returns only a minimal confirmation", async () => {
    const before = await Application.countDocuments();
    const data = validData();
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(json).sort(), ["applicationId", "message", "success"]);
    assert.equal(json.success, true);
    assert.match(json.applicationId, /^[0-9a-f-]{36}$/i);

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
    const data = { ...validData(), status: "approved" };
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));

    assert.equal(status, 400);
    assert.equal(json.success, false);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects internal-only fields (status, creditScore, adminNotes) and stores nothing", async () => {
    const before = await Application.countDocuments();
    const data = {
      ...validData(),
      status: "approved",
      creditScore: 900,
      adminNotes: "approve immediately",
    };
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));

    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before, "no document should be created when validation fails");
  });

  test("rejects a missing required field", async () => {
    const data = validData();
    delete data.applicant.firstName;
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects an invalid email", async () => {
    const data = validData();
    data.applicant.email = "not-an-email";
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a negative loan amount", async () => {
    const data = validData();
    data.loanRequest.requestedLoanAmount = -500;
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a bank routing number that fails the ABA checksum", async () => {
    const before = await Application.countDocuments();
    const data = validData();
    data.disbursement.bankDetails.bankRoutingNumber = "123456789";

    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);
  });

  test("rejects unknown/internal fields smuggled inside bankDetails and stores nothing", async () => {
    const before = await Application.countDocuments();
    const data = validData();
    data.disbursement.bankDetails.creditLimit = 50000;

    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);
  });

  test("requires otherMethodDetails when preferredMethod is 'other'", async () => {
    const data = validData();
    data.disbursement.preferredMethod = "other";

    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects malformed loan history records", async () => {
    const data = validData({
      loanHistory: [{ lenderName: "Bank", repaymentStatus: "not_a_real_status" }],
    });
    const { status, json } = await postForm("/api/applications", buildFormData({ data }));
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  describe("required verification images", () => {
    for (const field of ["idCardImage", "ssnCardImage", "selfieImage"]) {
      test(`rejects a submission missing ${field} and stores nothing`, async () => {
        const before = await Application.countDocuments();
        const form = buildFormData({ images: { [field]: undefined } });
        const { status, json } = await postForm("/api/applications", form);

        assert.equal(status, 400);
        assert.equal(json.code, "VALIDATION_ERROR");
        assert.ok(json.errors?.some((e) => e.field === field));
        assert.equal(await Application.countDocuments(), before);
      });
    }

    test("rejects a non-image file disguised as a required image and stores nothing", async () => {
      const before = await Application.countDocuments();
      const form = buildFormData({ images: { selfieImage: Buffer.from("not an image") } });
      const { status, json } = await postForm("/api/applications", form);

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

      const form = buildFormData({ images: { selfieImage: tiny } });
      const { status, json } = await postForm("/api/applications", form);
      assert.equal(status, 400);
      assert.equal(json.code, "INVALID_IMAGE");
      assert.equal(await Application.countDocuments(), before);
    });

    test("rejects an oversized image", async () => {
      // upload.js reads MAX_DOCUMENT_UPLOAD_SIZE_BYTES once at import time (default 8MB), so
      // this exercises that real default directly rather than trying to override it post-hoc.
      const before = await Application.countDocuments();
      const oversized = Buffer.alloc(9 * 1024 * 1024, 0xff);

      const form = buildFormData({ images: { selfieImage: oversized } });
      const { status } = await postForm("/api/applications", form);
      assert.equal(status, 413);
      assert.equal(await Application.countDocuments(), before);
    });
  });

  describe("upload/save failure handling (no orphaned data)", () => {
    test("rolls back already-uploaded Cloudinary assets if a later image fails to upload", async (t) => {
      const before = await Application.countDocuments();
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

      const { status, json } = await postForm("/api/applications", buildFormData());
      assert.equal(status, 500);
      assert.equal(json.code, "INTERNAL_ERROR");
      assert.ok(!("stack" in json));
      assert.equal(await Application.countDocuments(), before, "no application should be saved");
      assert.deepEqual(deleted, ["simulated/id_card"], "only the one asset that actually uploaded should be rolled back");
    });

    test("rolls back all uploaded Cloudinary assets if the MongoDB save fails", async (t) => {
      const before = await Application.countDocuments();
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

      const { status, json } = await postForm("/api/applications", buildFormData());
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

    const first = await postForm("/api/applications", buildFormData(), {
      "Idempotency-Key": key,
    });
    const second = await postForm("/api/applications", buildFormData(), {
      "Idempotency-Key": key,
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.json.applicationId, second.json.applicationId);

    const after = await Application.countDocuments();
    assert.equal(after, before + 1, "only one application should be created for one idempotency key");
  });

  test("rejects a malformed Idempotency-Key header", async () => {
    const { status, json } = await postForm("/api/applications", buildFormData(), {
      "Idempotency-Key": "!!!",
    });
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IDEMPOTENCY_KEY");
  });

  test("rejects malformed JSON in the 'data' field without leaking internals", async () => {
    const { status, json, text } = await postForm(
      "/api/applications",
      buildFormData({ data: "{not valid json" })
    );
    assert.equal(status, 400);
    assert.equal(json.code, "MALFORMED_JSON");
    assert.ok(!/at JSON\.parse|node_modules|\.js:\d+/.test(text), "response must not leak stack/file details");
  });

  test("error responses never include stack traces or internal details", async () => {
    const { json } = await postForm("/api/applications", buildFormData({ data: { applicant: {} } }));
    assert.ok(!("stack" in json));
    const serialized = JSON.stringify(json);
    assert.ok(!/node_modules|at .*\.js:\d+:\d+/.test(serialized));
  });

  test("does not leak the X-Powered-By header", async () => {
    const { headers } = await postForm("/api/applications", buildFormData());
    assert.equal(headers.get("x-powered-by"), null);
  });
});

describe("applicant data exposure / IDOR", () => {
  let applicationId;

  before(async () => {
    const { json } = await postForm("/api/applications", buildFormData());
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
