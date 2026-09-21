import { randomInt } from "node:crypto";

const ID_PREFIX = "LN";
const RANDOM_SEGMENT_LENGTH = 7;
// Excludes no characters (matches the recommended LN-YYYYMMDD-XXXXXXX format exactly): this is
// a human-readable public identifier, not a secret, so the small amount of visual ambiguity
// between e.g. "0"/"O" is an acceptable trade-off against a larger, well-known alphabet.
const RANDOM_SEGMENT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Exported so the request validator can accept exactly this shape for the `applicationId` a
// client echoes back from POST /api/applications/uploads/init — never the legacy UUID shape,
// which only ever originates server-side for applications created before this format existed.
export const NEW_APPLICATION_ID_REGEX = new RegExp(
  `^${ID_PREFIX}-\\d{8}-[A-Z0-9]{${RANDOM_SEGMENT_LENGTH}}$`
);
// Applications created before this format existed already have a crypto.randomUUID() value
// stored as their applicationId. Those records are never rewritten (see the migration note in
// docs/applications-api.md), so anything that accepts an applicationId from a URL/path — the
// document retake endpoint — must keep accepting this legacy shape indefinitely.
const LEGACY_UUID_APPLICATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomAlphanumeric(length) {
  let result = "";
  for (let i = 0; i < length; i++) {
    // crypto.randomInt is a CSPRNG with no modulo bias (unlike `randomBytes(n)[i] % alphabet.length`
    // would have) — never Math.random, which is not cryptographically secure.
    result += RANDOM_SEGMENT_ALPHABET[randomInt(RANDOM_SEGMENT_ALPHABET.length)];
  }
  return result;
}

function formatDateSegment(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

// Generates a human-readable, publicly displayable application identifier, e.g.
// "LN-20260913-A7K4P9X" — server-side only, never accepted as input from a client. The random
// segment alone carries 36^7 (~78 trillion) possibilities; combined with the MongoDB `unique`
// index on Application.applicationId (application.model.js), a collision is rejected outright
// rather than silently overwriting another application.
export function generateApplicationId(date = new Date()) {
  return `${ID_PREFIX}-${formatDateSegment(date)}-${randomAlphanumeric(RANDOM_SEGMENT_LENGTH)}`;
}

// Accepts either shape: the current human-readable format, or a legacy UUID from an application
// created before this format existed. Used to validate the applicationId path param on the
// document retake endpoint before ever querying MongoDB with it.
export function isValidApplicationId(value) {
  return (
    typeof value === "string" &&
    (NEW_APPLICATION_ID_REGEX.test(value) || LEGACY_UUID_APPLICATION_ID_REGEX.test(value))
  );
}
