import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import sharp from "sharp";
import { generateApplicationId } from "../utils/applicationId.js";

dotenv.config({ path: ".env" });

// Isolated from application.api.test.js's count-based assertions (own database, own Cloudinary
// folder) — same convention as document.upload.test.js. TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID come
// from .env here (so telegramNotifier.isConfigured() is true and the real notification code path
// in application.service.js actually runs), but every test below mocks telegramNotifier's
// network-facing methods directly — no real Telegram API call is ever made, and no real bot
// token is required for this file to pass.
process.env.APPLICATION_RATE_LIMIT_MAX = "1000";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX = "1000";

const TEST_DB_NAME = "Sales_test_telegram_notification";
const uploadFolder = `loan-applications-test/${randomUUID()}`;
process.env.CLOUDINARY_UPLOAD_FOLDER = uploadFolder;

let app;
let Application;
let cloudinary;
let telegramNotifier;
let notifyTelegramSafely;
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

async function initAndStage() {
  const { json: init } = await apiPost("/api/applications/uploads/init", {});
  for (const field of ["idCardImage", "ssnCardImage", "selfieImage"]) {
    await uploadToCloudinaryDirect(validJpegBuffer, init.uploads[field]);
  }
  return init.applicationId;
}

async function submitApplication({ data = validData(), headers = {} } = {}) {
  const applicationId = await initAndStage();
  return apiPost("/api/applications", { ...data, applicationId }, headers);
}

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run telegram.notification.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  ({ default: app } = await import("../app.js"));
  ({ default: Application } = await import("../models/application.model.js"));
  ({ default: cloudinary } = await import("../config/cloudinary.js"));
  ({ telegramNotifier } = await import("../services/telegram.service.js"));
  ({ notifyTelegramSafely } = await import("../services/application.service.js"));

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
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
  await cloudinary.api.delete_resources_by_prefix(uploadFolder, { resource_type: "image", type: "authenticated" });
});

describe("Telegram notification on successful submission", () => {
  test("sends one application summary and the three processed images, and marks the notification sent", async (t) => {
    const summaryCalls = [];
    const imageCalls = [];
    t.mock.method(telegramNotifier, "sendApplicationSummary", async (doc) => {
      summaryCalls.push(doc);
    });
    t.mock.method(telegramNotifier, "sendApplicationImages", async (applicationId, images) => {
      imageCalls.push({ applicationId, images });
    });

    const data = validData();
    const { status, json } = await submitApplication({ data });
    assert.equal(status, 201);

    assert.equal(summaryCalls.length, 1);
    assert.equal(summaryCalls[0].applicant.email, data.applicant.email);
    assert.equal(summaryCalls[0].applicationId, json.applicationId);

    assert.equal(imageCalls.length, 1);
    assert.equal(imageCalls[0].applicationId, json.applicationId);
    assert.deepEqual(Object.keys(imageCalls[0].images).sort(), ["id_card", "selfie", "ssn_card"]);
    for (const buffer of Object.values(imageCalls[0].images)) {
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 0);
    }

    const stored = await Application.findOne({ applicationId: json.applicationId }).lean();
    assert.equal(stored.telegramNotification.status, "sent");
    assert.ok(stored.telegramNotification.sentAt instanceof Date);
  });

  test("the images handed to Telegram are the processed/re-encoded JPEGs, not the raw upload", async (t) => {
    let capturedImages;
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {});
    t.mock.method(telegramNotifier, "sendApplicationImages", async (_applicationId, images) => {
      capturedImages = images;
    });

    await submitApplication();

    for (const buffer of Object.values(capturedImages)) {
      const meta = await sharp(buffer).metadata();
      assert.equal(meta.format, "jpeg");
      assert.ok(!meta.exif, "EXIF metadata must already be stripped by the time Telegram receives it");
    }
  });

  test("the summary includes the complete submitted application, and never infrastructure secrets", async () => {
    // Deliberately does not mock sendApplicationSummary itself — that would only prove what
    // object application.service.js passes in, not what text actually reaches the wire. Instead
    // this lets the real sendApplicationSummary -> buildApplicationSummaryText -> sendMessage
    // path run, and intercepts only the final HTTP call, to inspect the literal message text.
    // Stubs every Telegram API call (sendMessage AND sendPhoto) with a fake success response —
    // this must never fall through to the real network, since .env carries a real bot token in
    // this environment and sendApplicationImages is not mocked in this particular test.
    const originalFetch = globalThis.fetch;
    let capturedText;
    globalThis.fetch = async (url, init) => {
      // Only intercept calls actually bound for the Telegram API — this same global fetch is
      // also used to reach the local test server and Cloudinary directly, which must go through.
      if (!String(url).startsWith("https://api.telegram.org")) return originalFetch(url, init);
      if (String(url).includes("/sendMessage")) {
        capturedText = JSON.parse(init.body).text;
      }
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    };

    const data = validData({
      loanHistory: [
        {
          lenderName: "Old Bank",
          loanType: "personal",
          originalLoanAmount: 5000,
          outstandingAmount: 1200,
          repaymentStatus: "active",
          startDate: "2023-01-15",
          repaymentFrequency: "monthly",
          monthlyPayment: 250,
          purpose: "car repair",
        },
      ],
    });

    try {
      const { status } = await submitApplication({ data });
      assert.equal(status, 201);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.ok(capturedText, "sendMessage should have been invoked");

    // The full submitted application is included — this is the only place it's ever reviewed,
    // since there is no admin retrieval endpoint.
    assert.ok(capturedText.includes(data.disbursement.bankDetails.accountNumber));
    assert.ok(capturedText.includes(data.disbursement.bankDetails.bankRoutingNumber));
    assert.ok(capturedText.includes(data.disbursement.bankDetails.accountHolderName));
    assert.ok(capturedText.includes("Old Bank"));
    assert.ok(capturedText.includes("car repair"));
    assert.ok(capturedText.includes(data.applicant.residentialAddress));

    // Infrastructure secrets must never appear, regardless of how much applicant data is included.
    assert.ok(!/cloudinary/i.test(capturedText));
    assert.ok(!/https?:\/\//i.test(capturedText));
    assert.ok(!capturedText.includes(process.env.MONGO_URI ?? "__unset__"));
  });
});

describe("Telegram failure handling", () => {
  test("a sendMessage failure does not roll back the already-saved MongoDB application", async (t) => {
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {
      throw new Error("simulated Telegram outage");
    });
    t.mock.method(telegramNotifier, "sendApplicationImages", async () => {});

    const { status, json } = await submitApplication();
    assert.equal(status, 201, "the API must still report success to the applicant");
    assert.equal(json.success, true);

    const stored = await Application.findOne({ applicationId: json.applicationId }).lean();
    assert.ok(stored, "the application must remain persisted despite the Telegram failure");
    assert.equal(stored.telegramNotification.status, "failed");
  });

  test("a sendApplicationImages failure does not roll back the already-saved MongoDB application", async (t) => {
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {});
    t.mock.method(telegramNotifier, "sendApplicationImages", async () => {
      throw new Error("simulated Telegram outage");
    });

    const { status, json } = await submitApplication();
    assert.equal(status, 201);

    const stored = await Application.findOne({ applicationId: json.applicationId }).lean();
    assert.ok(stored);
    assert.equal(stored.telegramNotification.status, "failed");
  });

  test("the response never exposes the Telegram bot token or any Telegram error detail", async (t) => {
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {
      const err = new Error("TELEGRAM_API_ERROR");
      err.telegramHttpStatus = 401;
      err.telegramErrorCode = 401;
      throw err;
    });
    t.mock.method(telegramNotifier, "sendApplicationImages", async () => {});

    const { text } = await submitApplication();
    assert.ok(!text.includes(process.env.TELEGRAM_BOT_TOKEN));
    assert.ok(!/telegram/i.test(text));
  });
});

describe("Duplicate notification prevention", () => {
  test("a repeated request with the same Idempotency-Key sends only one Telegram notification", async (t) => {
    let calls = 0;
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {
      calls += 1;
    });
    t.mock.method(telegramNotifier, "sendApplicationImages", async () => {});

    const key = `telegram-test-${randomUUID()}`;
    const applicationId1 = await initAndStage();
    const first = await apiPost("/api/applications", { ...validData(), applicationId: applicationId1 }, {
      "Idempotency-Key": key,
    });
    // The idempotency check short-circuits before staged uploads are ever looked at, so the
    // replay doesn't need a second real set of Cloudinary uploads.
    const applicationId2 = generateApplicationId();
    const second = await apiPost("/api/applications", { ...validData(), applicationId: applicationId2 }, {
      "Idempotency-Key": key,
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.json.applicationId, second.json.applicationId);
    assert.equal(calls, 1, "the replayed request must not trigger a second Telegram notification");
  });

  test("calling the notification step again for an already-'sent' application is a no-op", async (t) => {
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {});
    t.mock.method(telegramNotifier, "sendApplicationImages", async () => {});

    const { json } = await submitApplication();
    const sentDoc = await Application.findOne({ applicationId: json.applicationId }).lean();
    assert.equal(sentDoc.telegramNotification.status, "sent");

    let secondAttemptCalls = 0;
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {
      secondAttemptCalls += 1;
    });

    await notifyTelegramSafely({ doc: sentDoc, images: {}, requestId: "manual-retry-test" });
    assert.equal(secondAttemptCalls, 0, "an application already marked 'sent' must not be re-notified");
  });

  test("retaking a document does not trigger another full application summary notification", async (t) => {
    let summaryCalls = 0;
    t.mock.method(telegramNotifier, "sendApplicationSummary", async () => {
      summaryCalls += 1;
    });
    t.mock.method(telegramNotifier, "sendApplicationImages", async () => {});

    const created = await submitApplication();
    assert.equal(summaryCalls, 1);

    const { json: retakeInit } = await apiPost(
      `/api/applications/${created.json.applicationId}/documents/init`,
      { kind: "selfie" }
    );
    await uploadToCloudinaryDirect(validJpegBuffer, retakeInit.upload);
    const retake = await apiPost(`/api/applications/${created.json.applicationId}/documents`, { kind: "selfie" });

    assert.equal(retake.status, 201);
    assert.equal(summaryCalls, 1, "a document retake must not send another full application notification");
  });
});
