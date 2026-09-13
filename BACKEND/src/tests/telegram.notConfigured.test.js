import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sharp from "sharp";

dotenv.config({ path: ".env" });

// Deliberately removed AFTER loading .env (which carries real values for local development) but
// BEFORE importing app.js — Telegram is an optional operational feature (unlike Cloudinary/
// MongoDB), so the whole point of this file is to prove the API still works normally without it.
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

process.env.APPLICATION_RATE_LIMIT_MAX = "1000";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX = "1000";

const TEST_DB_NAME = "Sales_test_telegram_unconfigured";
const uploadFolder = `loan-applications-test/${randomUUID()}`;
process.env.CLOUDINARY_UPLOAD_FOLDER = uploadFolder;

let app;
let Application;
let cloudinary;
let telegramNotifier;
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
        bankRoutingNumber: "011401533",
        accountNumber: "1234567890",
        accountType: "checking",
        bankType: "bank",
      },
    },
    consent: { termsAccepted: true, dataProcessingAccepted: true },
    ...overrides,
  };
}

function buildFormData({ data = validData() } = {}) {
  const form = new FormData();
  form.append("data", JSON.stringify(data));
  for (const field of ["idCardImage", "ssnCardImage", "selfieImage"]) {
    form.append(field, new Blob([validJpegBuffer], { type: "image/jpeg" }), `${field}.jpg`);
  }
  return form;
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

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run telegram.notConfigured.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  ({ default: app } = await import("../app.js"));
  ({ default: Application } = await import("../models/application.model.js"));
  ({ default: cloudinary } = await import("../config/cloudinary.js"));
  ({ telegramNotifier } = await import("../services/telegram.service.js"));

  validJpegBuffer = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 7, g: 7, b: 7 } },
  })
    .jpeg()
    .toBuffer();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await Application.deleteMany({});
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
  await cloudinary.api.delete_resources_by_prefix(uploadFolder, { resource_type: "image", type: "authenticated" });
});

test("telegramNotifier reports not configured when TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are unset", () => {
  assert.equal(telegramNotifier.isConfigured(), false);
});

test("application submission still succeeds end-to-end when Telegram is not configured", async (t) => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    // Only flag calls actually bound for the Telegram API — postForm below also uses this same
    // global fetch to reach the local test server, which is expected and must not count here.
    if (String(args[0]).startsWith("https://api.telegram.org")) fetchCalled = true;
    return originalFetch(...args);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { status, json } = await postForm("/api/applications", buildFormData());

  assert.equal(status, 201);
  assert.equal(json.success, true);
  assert.match(json.applicationId, /^LN-\d{8}-[A-Z0-9]{7}$/);

  const stored = await Application.findOne({ applicationId: json.applicationId }).lean();
  assert.ok(stored, "the application must still be persisted to MongoDB");
  assert.equal(
    stored.telegramNotification.status,
    "pending",
    "no notification attempt should be made (and none claimed/failed) when Telegram isn't configured"
  );
  assert.equal(fetchCalled, false, "no HTTP call should be made toward the Telegram API");
});

test("the retake endpoint still works normally when Telegram is not configured", async () => {
  const created = await postForm("/api/applications", buildFormData());
  assert.equal(created.status, 201);

  const retakeForm = new FormData();
  retakeForm.append("kind", "selfie");
  retakeForm.append("image", new Blob([validJpegBuffer], { type: "image/jpeg" }), "selfie.jpg");
  const retake = await postForm(`/api/applications/${created.json.applicationId}/documents`, retakeForm);

  assert.equal(retake.status, 201);
  assert.equal(retake.json.success, true);
});
