import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Deliberately no dotenv/.env loading and no real network in this file: telegram.service.js
// must be fully testable without a real bot token, and every test below drives its config
// through explicit process.env assignments and a mocked global fetch.
const { telegramNotifier, buildApplicationSummaryText } = await import("../services/telegram.service.js");

// Node's global `fetch` is a plain configurable/writable property, but it must still be
// restored to its original value (never left deleted) since every test in this file shares one
// process — leaving it deleted after one test would break fetch for every test that runs after it.
function withMockedFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = original;
    });
}

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function fakeSavedApplication(overrides = {}) {
  return {
    applicationId: "LN-20260115-A7K4P9X",
    applicant: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phoneNumber: "+1 555-123-4567",
      dateOfBirth: new Date("1990-01-01"),
      residentialAddress: "123 Main St",
      city: "Springfield",
      state: "IL",
    },
    employment: {
      employmentStatus: "employed",
      employerName: "Acme Corp",
      jobTitle: "Engineer",
      monthlyIncome: { toString: () => "4500.00" },
      incomeFrequency: "monthly",
    },
    loanRequest: {
      requestedLoanAmount: { toString: () => "10000.00" },
      loanPurpose: "Home renovation",
      preferredRepaymentPeriodMonths: 24,
      repaymentFrequency: "monthly",
    },
    loanHistory: [],
    metadata: { submittedAt: new Date("2026-01-15T10:00:00.000Z") },
    documents: [
      { kind: "id_card", publicId: "loan-applications/abc/id_card-xyz", resourceType: "image" },
    ],
    disbursement: {
      preferredMethod: "direct_deposit",
      bankDetails: {
        accountHolderName: "Jane Doe",
        bankRoutingNumber: "011401533",
        accountNumber: "999999999",
      },
    },
    password: "shouldNeverAppear",
    passwordHash: "$2b$10$shouldNeverAppear",
    otp: "123456",
    pin: "4321",
    cvv: "999",
    apiKey: "sk-shouldNeverAppear",
    ...overrides,
  };
}

describe("telegramNotifier.isConfigured", () => {
  test("is true only when both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100123" }, () => {
      assert.equal(telegramNotifier.isConfigured(), true);
    }));

  test("is false when TELEGRAM_BOT_TOKEN is missing", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: "-100123" }, () => {
      assert.equal(telegramNotifier.isConfigured(), false);
    }));

  test("is false when TELEGRAM_CHAT_ID is missing", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: undefined }, () => {
      assert.equal(telegramNotifier.isConfigured(), false);
    }));

  test("is false when neither is set", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, () => {
      assert.equal(telegramNotifier.isConfigured(), false);
    }));
});

describe("buildApplicationSummaryText", () => {
  test("maps only genuine application-schema fields into the summary", () => {
    const text = buildApplicationSummaryText(fakeSavedApplication());

    assert.match(text, /Application ID: LN-20260115-A7K4P9X/);
    assert.match(text, /Name: Jane Doe/);
    assert.match(text, /Phone: \+1 555-123-4567/);
    assert.match(text, /Email: jane@example\.com/);
    assert.match(text, /Address: 123 Main St, Springfield, IL/);
    assert.match(text, /Status: employed/);
    assert.match(text, /Employer: Acme Corp/);
    assert.match(text, /Monthly Income: 4500\.00 \(monthly\)/);
    assert.match(text, /Amount Requested: 10000\.00/);
    assert.match(text, /Purpose: Home renovation/);
    assert.match(text, /Repayment Period: 24 months \(monthly\)/);
    assert.match(text, /Previous Loan: None declared/);
    assert.match(text, /ID Card/);
    assert.match(text, /SSN Card/);
    assert.match(text, /Selfie/);
    assert.match(text, /Status: Submitted/);
  });

  test("summarizes loan history to the most recent entry plus a count of the rest", () => {
    const doc = fakeSavedApplication({
      loanHistory: [
        {
          lenderName: "First Bank",
          originalLoanAmount: { toString: () => "5000.00" },
          repaymentStatus: "paid",
          startDate: new Date("2020-01-01"),
        },
        {
          lenderName: "Second Bank",
          originalLoanAmount: { toString: () => "2000.00" },
          repaymentStatus: "active",
          startDate: new Date("2021-01-01"),
        },
      ],
    });
    const text = buildApplicationSummaryText(doc);

    assert.match(text, /Previous Loan: First Bank \(\+1 more\)/);
    assert.match(text, /Previous Loan Amount: 5000\.00/);
    assert.match(text, /Previous Loan Status: paid/);
  });

  test("never includes authentication/security secrets even if present on the document", () => {
    const text = buildApplicationSummaryText(fakeSavedApplication());

    for (const secret of [
      "shouldNeverAppear",
      "$2b$10$shouldNeverAppear",
      "123456",
      "4321",
      "999",
      "sk-shouldNeverAppear",
    ]) {
      assert.ok(!text.includes(secret), `summary must not contain secret value: ${secret}`);
    }
  });

  test("never includes bank account/routing numbers or any disbursement field", () => {
    const text = buildApplicationSummaryText(fakeSavedApplication());
    assert.ok(!text.includes("011401533"));
    assert.ok(!text.includes("999999999"));
    assert.ok(!/disbursement/i.test(text));
    assert.ok(!/bank/i.test(text));
  });

  test("never includes Cloudinary URLs, public IDs, or delivery details", () => {
    const text = buildApplicationSummaryText(fakeSavedApplication());
    assert.ok(!/https?:\/\//i.test(text), "must not contain any URL");
    assert.ok(!/cloudinary/i.test(text));
    assert.ok(!text.includes("loan-applications/abc/id_card-xyz"));
  });
});

describe("telegramNotifier.sendMessage", () => {
  test("posts JSON to the Telegram API using TELEGRAM_CHAT_ID from the environment", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100999" }, async () => {
      let capturedUrl, capturedInit;
      await withMockedFetch(
        async (url, init) => {
          capturedUrl = url;
          capturedInit = init;
          return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
        },
        () => telegramNotifier.sendMessage("hello")
      );

      assert.match(capturedUrl, /^https:\/\/api\.telegram\.org\/bottest-token\/sendMessage$/);
      const body = JSON.parse(capturedInit.body);
      assert.equal(body.chat_id, "-100999");
      assert.equal(body.text, "hello");
    }));

  test("throws without calling fetch when Telegram is not configured", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, async () => {
      let called = false;
      await withMockedFetch(
        async () => {
          called = true;
          return new Response("{}");
        },
        () => assert.rejects(telegramNotifier.sendMessage("hello"))
      );
      assert.equal(called, false);
    }));

  test("wraps a non-OK Telegram response into a generic error without leaking the response body", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100999" }, async () => {
      await withMockedFetch(
        async () =>
          new Response(
            JSON.stringify({ ok: false, error_code: 400, description: "sensitive-looking detail" }),
            { status: 400 }
          ),
        () =>
          assert.rejects(telegramNotifier.sendMessage("hello"), (err) => {
            assert.equal(err.message, "TELEGRAM_API_ERROR");
            assert.equal(err.telegramErrorCode, 400);
            assert.ok(!String(err.message).includes("sensitive-looking"));
            return true;
          })
      );
    }));

  test("aborts and rejects instead of hanging when the request exceeds the configured timeout", () =>
    withEnv(
      { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100999", TELEGRAM_REQUEST_TIMEOUT_MS: "50" },
      async () => {
        await withMockedFetch(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
            }),
          () =>
            assert.rejects(telegramNotifier.sendMessage("hello"), (err) => {
              assert.equal(err.message, "TELEGRAM_REQUEST_TIMEOUT");
              return true;
            })
        );
      }
    ));
});

describe("telegramNotifier.sendPhoto", () => {
  test("posts multipart form data containing chat_id, caption, and the photo buffer", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100999" }, async () => {
      let capturedUrl, capturedForm;
      await withMockedFetch(
        async (url, init) => {
          capturedUrl = url;
          capturedForm = init.body;
          return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
        },
        () =>
          telegramNotifier.sendPhoto({
            buffer: Buffer.from([0xff, 0xd8, 0xff]),
            filename: "selfie.jpg",
            caption: "SELFIE\nApplication ID: abc-123",
          })
      );

      assert.match(capturedUrl, /\/sendPhoto$/);
      assert.ok(capturedForm instanceof FormData);
      assert.equal(capturedForm.get("chat_id"), "-100999");
      assert.equal(capturedForm.get("caption"), "SELFIE\nApplication ID: abc-123");
      const photo = capturedForm.get("photo");
      assert.equal(photo.name, "selfie.jpg");
    }));
});

describe("telegramNotifier.sendApplicationImages", () => {
  test("sends all three documents with captions carrying the human-readable applicationId, not a Cloudinary reference", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100999" }, async () => {
      const captions = [];
      await withMockedFetch(
        async (_url, init) => {
          captions.push(init.body.get("caption"));
          return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
        },
        () =>
          telegramNotifier.sendApplicationImages("LN-20260913-A7K4P9X", {
            id_card: Buffer.from([1]),
            ssn_card: Buffer.from([2]),
            selfie: Buffer.from([3]),
          })
      );

      assert.equal(captions.length, 3);
      for (const caption of captions) {
        assert.match(caption, /Application ID: LN-20260913-A7K4P9X/);
        assert.ok(!/cloudinary/i.test(caption));
        assert.ok(!/https?:\/\//i.test(caption));
      }
      assert.ok(captions.some((c) => c.startsWith("ID CARD")));
      assert.ok(captions.some((c) => c.startsWith("SSN CARD")));
      assert.ok(captions.some((c) => c.startsWith("SELFIE")));
    }));

  test("skips a kind with no buffer instead of sending an empty photo", () =>
    withEnv({ TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "-100999" }, async () => {
      let callCount = 0;
      await withMockedFetch(
        async () => {
          callCount += 1;
          return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
        },
        () =>
          telegramNotifier.sendApplicationImages("LN-20260913-A7K4P9X", {
            id_card: Buffer.from([1]),
          })
      );
      assert.equal(callCount, 1);
    }));
});
