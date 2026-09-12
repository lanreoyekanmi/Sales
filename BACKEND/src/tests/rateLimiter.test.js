import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";

// This file never touched Mongo before, so it never needed this — but app.js now transitively
// imports config/cloudinary.js, which throws if its required env vars aren't loaded yet.
dotenv.config({ path: ".env" });

// Node's test runner executes each test file in its own process, so mutating these env vars
// here does not affect the rate limits used by other test files or the real app.
process.env.APPLICATION_RATE_LIMIT_MAX = "3";
process.env.APPLICATION_RATE_LIMIT_WINDOW_MS = "60000";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX = "3";
process.env.DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_MS = "60000";

let server;
let baseUrl;

before(async () => {
  // Rate limiting runs before body validation, so a trivially invalid body is enough here —
  // this test never needs a database connection.
  const { default: app } = await import("../app.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
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
    // Rate limiting runs before multer/validation, so a body that isn't even valid
    // multipart is enough here — this test never needs a database connection.
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
