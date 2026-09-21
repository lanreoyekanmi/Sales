import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env" });

// Node's test runner executes each test file in its own process, so mutating these env vars
// here does not affect the rate limits used by other test files or the real app.
process.env.APPLICATION_RATE_LIMIT_MAX = "3";
process.env.APPLICATION_RATE_LIMIT_WINDOW_MS = "60000";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX = "3";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_MS = "60000";

// The rate limiter is backed by MongoDB (see middleware/mongoRateLimiter.js) so the limit is
// enforced correctly across concurrent Vercel Function instances, which don't share process
// memory the way a single long-running server does — this file needs its own DB connection now.
const TEST_DB_NAME = "Sales_test_rate_limiter";

let server;
let baseUrl;

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run rateLimiter.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  // Start from a clean slate: a counter from a previous run of this same file within the same
  // fixed time window (unlike the old in-memory store, a MongoDB-backed one persists across
  // process runs until its TTL expires) would otherwise make these count-based assertions flaky.
  const { default: RateLimitHit } = await import("../models/rateLimitHit.model.js");
  await RateLimitHit.deleteMany({});

  // Rate limiting runs before body validation, so a trivially invalid body is enough here.
  const { default: app } = await import("../app.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  const { default: RateLimitHit } = await import("../models/rateLimitHit.model.js");
  await RateLimitHit.deleteMany({});
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

test("the public submission endpoint is rate limited per IP", async () => {
  const max = Number(process.env.APPLICATION_RATE_LIMIT_MAX);
  const responses = [];

  for (let i = 0; i < max + 2; i++) {
    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    responses.push(res.status);
  }

  assert.ok(responses.includes(429), `expected at least one 429 among: ${responses.join(",")}`);

  const limitedIndex = responses.indexOf(429);
  assert.ok(limitedIndex >= max, "requests within the configured limit should not be rate limited");
});

test("the document upload endpoint is rate limited per IP, independently of the submission limiter", async () => {
  const max = Number(process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX);
  const responses = [];

  for (let i = 0; i < max + 2; i++) {
    // Rate limiting runs before validation, so a trivial body is enough here.
    const res = await fetch(`${baseUrl}/api/applications/${"0".repeat(36)}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    responses.push(res.status);
  }

  assert.ok(responses.includes(429), `expected at least one 429 among: ${responses.join(",")}`);

  const limitedIndex = responses.indexOf(429);
  assert.ok(limitedIndex >= max, "requests within the configured limit should not be rate limited");
});
