import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateApplicationId, isValidApplicationId } from "../utils/applicationId.js";

const FORMAT_REGEX = /^LN-\d{8}-[A-Z0-9]{7}$/;

describe("generateApplicationId", () => {
  test("returns the LN-YYYYMMDD-XXXXXXX format", () => {
    const id = generateApplicationId();
    assert.match(id, FORMAT_REGEX);
  });

  test("embeds the UTC date of the given Date argument", () => {
    const id = generateApplicationId(new Date("2026-09-13T23:59:59.000Z"));
    assert.match(id, /^LN-20260913-[A-Z0-9]{7}$/);
  });

  test("defaults to the current UTC date when no date is given", () => {
    const now = new Date();
    const expected = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
      now.getUTCDate()
    ).padStart(2, "0")}`;
    const id = generateApplicationId();
    assert.equal(id.split("-")[1], expected);
  });

  test("carries no applicant PII — only the fixed prefix, date, and random characters", () => {
    const id = generateApplicationId(new Date("2026-09-13T00:00:00.000Z"));
    // Structural check that the format itself has no room for embedded data beyond a plain
    // calendar date and opaque random characters — nothing resembling a phone number, SSN/NIN/
    // BVN-length digit run, or name is possible in a 3-segment LN-YYYYMMDD-XXXXXXX string.
    const segments = id.split("-");
    assert.equal(segments.length, 3);
    assert.equal(segments[0], "LN");
    assert.equal(segments[1].length, 8);
    assert.equal(segments[2].length, 7);
  });

  test("produces unique IDs across a large sample even when generated for the same date", () => {
    const fixedDate = new Date("2026-09-13T12:00:00.000Z");
    const count = 5000;
    const ids = new Set();
    for (let i = 0; i < count; i++) {
      ids.add(generateApplicationId(fixedDate));
    }
    assert.equal(ids.size, count, "every generated ID in the sample should be unique");
  });

  test("never relies on Math.random() for the random segment", () => {
    const originalRandom = Math.random;
    Math.random = () => {
      throw new Error("generateApplicationId must not call Math.random()");
    };
    try {
      for (let i = 0; i < 50; i++) {
        assert.match(generateApplicationId(), FORMAT_REGEX);
      }
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe("isValidApplicationId", () => {
  test("accepts a freshly generated ID", () => {
    assert.equal(isValidApplicationId(generateApplicationId()), true);
  });

  test("accepts a legacy crypto.randomUUID()-style ID for backward compatibility", () => {
    assert.equal(isValidApplicationId(randomUUID()), true);
  });

  test("rejects malformed, empty, or non-string input", () => {
    for (const value of [
      "",
      "not-an-id",
      "LN-2026-ABC",
      "LN-20260913-ABC", // random segment too short
      "LN-20260913-ABCDEFGH", // random segment too long
      "LN-20260913-a7k4p9x", // lowercase random segment
      "ln-20260913-A7K4P9X", // lowercase prefix
      "LN20260913A7K4P9X", // missing separators
      null,
      undefined,
      12345,
      "'; DROP TABLE applications; --",
    ]) {
      assert.equal(isValidApplicationId(value), false, `expected ${JSON.stringify(value)} to be invalid`);
    }
  });
});
