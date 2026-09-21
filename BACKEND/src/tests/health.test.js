import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";

// app.js transitively imports config/cloudinary.js, which throws if its required env vars
// aren't loaded yet — this file never touches Mongo/Cloudinary itself, but still needs them
// loaded before importing app.js below.
dotenv.config({ path: ".env" });

let server;
let baseUrl;

before(async () => {
  const { default: app } = await import("../app.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("GET /api/health returns a minimal safe success response", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { success: true, message: "API is running" });
});

test("GET /api/health never exposes credentials or internal configuration", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const text = await res.text();

  assert.ok(!/mongodb(\+srv)?:\/\//i.test(text));
  assert.ok(!process.env.CLOUDINARY_API_SECRET || !text.includes(process.env.CLOUDINARY_API_SECRET));
  assert.ok(!process.env.TELEGRAM_BOT_TOKEN || !text.includes(process.env.TELEGRAM_BOT_TOKEN));
});
