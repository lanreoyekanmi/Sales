import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env" });

// This file exercises many submissions against one in-process app instance/rate limiter.
// Actual rate-limiting behavior has its own dedicated, isolated test in rateLimiter.test.js —
// raise the limit here so it doesn't interfere with these functional assertions.
process.env.APPLICATION_RATE_LIMIT_MAX = "1000";

// Dedicated, disposable database for this test run — never the app's real "Sales" database.
const TEST_DB_NAME = "Sales_test";

let app;
let Application;
let IdempotencyKey;
let server;
let baseUrl;

function validPayload(overrides = {}) {
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

async function post(path, body, headers = {}) {
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

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run application.api.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  ({ default: app } = await import("../app.js"));
  ({ default: Application } = await import("../models/application.model.js"));
  ({ default: IdempotencyKey } = await import("../models/idempotencyKey.model.js"));

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await Application.deleteMany({});
  await IdempotencyKey.deleteMany({});
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

describe("POST /api/applications", () => {
  test("accepts a valid submission and returns only a minimal confirmation", async () => {
    const before = await Application.countDocuments();
    const payload = validPayload();
    const { status, json } = await post("/api/applications", payload);

    assert.equal(status, 201);
    assert.deepEqual(Object.keys(json).sort(), ["applicationId", "message", "success"]);
    assert.equal(json.success, true);
    assert.match(json.applicationId, /^[0-9a-f-]{36}$/i);

    const after = await Application.countDocuments();
    assert.equal(after, before + 1);

    const stored = await Application.findOne({ applicationId: json.applicationId }).lean();
    assert.ok(stored);
    assert.equal(stored.status, "submitted");
    assert.equal(stored.applicant.email, payload.applicant.email);

    // select: false fields are excluded by default, even for this internal/test-only query.
    assert.equal(stored.disbursement.bankDetails.accountNumber, undefined);
    assert.equal(stored.disbursement.bankDetails.bankRoutingNumber, undefined);
    assert.equal(stored.disbursement.bankDetails.accountType, "checking");

    const withBankDetails = await Application.findOne({ applicationId: json.applicationId })
      .select("+disbursement.bankDetails.accountNumber +disbursement.bankDetails.bankRoutingNumber")
      .lean();
    assert.equal(withBankDetails.disbursement.bankDetails.accountNumber, payload.disbursement.bankDetails.accountNumber);
  });

  test("forces status to 'submitted' server-side even if the client sends a status field", async () => {
    const payload = { ...validPayload(), status: "approved" };
    const { status, json } = await post("/api/applications", payload);

    assert.equal(status, 400);
    assert.equal(json.success, false);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects internal-only fields (status, creditScore, adminNotes) and stores nothing", async () => {
    const before = await Application.countDocuments();
    const payload = {
      ...validPayload(),
      status: "approved",
      creditScore: 900,
      adminNotes: "approve immediately",
    };
    const { status, json } = await post("/api/applications", payload);

    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");

    const after = await Application.countDocuments();
    assert.equal(after, before, "no document should be created when validation fails");
  });

  test("rejects a missing required field", async () => {
    const payload = validPayload();
    delete payload.applicant.firstName;
    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects an invalid email", async () => {
    const payload = validPayload();
    payload.applicant.email = "not-an-email";
    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a negative loan amount", async () => {
    const payload = validPayload();
    payload.loanRequest.requestedLoanAmount = -500;
    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects a bank routing number that fails the ABA checksum", async () => {
    const before = await Application.countDocuments();
    const payload = validPayload();
    payload.disbursement.bankDetails.bankRoutingNumber = "123456789";

    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);
  });

  test("rejects an application missing bank disbursement details", async () => {
    const payload = validPayload();
    delete payload.disbursement.bankDetails;

    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects unknown/internal fields smuggled inside bankDetails and stores nothing", async () => {
    const before = await Application.countDocuments();
    const payload = validPayload();
    payload.disbursement.bankDetails.creditLimit = 50000;

    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(await Application.countDocuments(), before);
  });

  test("requires otherMethodDetails when preferredMethod is 'other'", async () => {
    const payload = validPayload();
    payload.disbursement.preferredMethod = "other";

    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("rejects malformed loan history records", async () => {
    const payload = validPayload({
      loanHistory: [{ lenderName: "Bank", repaymentStatus: "not_a_real_status" }],
    });
    const { status, json } = await post("/api/applications", payload);
    assert.equal(status, 400);
    assert.equal(json.code, "VALIDATION_ERROR");
  });

  test("repeated requests with the same Idempotency-Key do not create duplicate applications", async () => {
    const key = `test-${randomUUID()}`;
    const payload = validPayload();
    const before = await Application.countDocuments();

    const first = await post("/api/applications", payload, { "Idempotency-Key": key });
    const second = await post("/api/applications", payload, { "Idempotency-Key": key });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.json.applicationId, second.json.applicationId);

    const after = await Application.countDocuments();
    assert.equal(after, before + 1, "only one application should be created for one idempotency key");
  });

  test("rejects a malformed Idempotency-Key header", async () => {
    const { status, json } = await post("/api/applications", validPayload(), {
      "Idempotency-Key": "!!!",
    });
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_IDEMPOTENCY_KEY");
  });

  test("rejects oversized request bodies", async () => {
    const payload = validPayload({
      loanRequest: {
        ...validPayload().loanRequest,
        loanPurpose: "x".repeat(200_000),
      },
    });
    const { status } = await post("/api/applications", payload);
    assert.equal(status, 413);
  });

  test("rejects malformed JSON without leaking internals", async () => {
    const { status, json, text } = await post("/api/applications", "{not valid json");
    assert.equal(status, 400);
    assert.equal(json.code, "MALFORMED_JSON");
    assert.ok(!/at JSON\.parse|node_modules|\.js:\d+/.test(text), "response must not leak stack/file details");
  });

  test("error responses never include stack traces or internal details", async () => {
    const { json } = await post("/api/applications", { applicant: {} });
    assert.ok(!("stack" in json));
    const serialized = JSON.stringify(json);
    assert.ok(!/node_modules|at .*\.js:\d+:\d+/.test(serialized));
  });

  test("does not leak the X-Powered-By header", async () => {
    const { headers } = await post("/api/applications", validPayload());
    assert.equal(headers.get("x-powered-by"), null);
  });
});

describe("applicant data exposure / IDOR", () => {
  let applicationId;

  before(async () => {
    const { json } = await post("/api/applications", validPayload());
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
});
