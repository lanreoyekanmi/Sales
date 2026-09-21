import mongoose from "mongoose";

const { Schema } = mongoose;

// One document per (scope, IP, fixed time window) — see middleware/mongoRateLimiter.js. A
// MongoDB-backed counter, rather than express-rate-limit's in-memory store, is what lets the
// limit be enforced correctly across concurrent Vercel Function instances, which do not share
// process memory the way a single long-running server does.
const rateLimitHitSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  count: { type: Number, required: true, default: 0 },
  // TTL index: MongoDB deletes the document automatically once expiresAt passes, so old
  // windows never need explicit cleanup.
  expiresAt: { type: Date, required: true, expires: 0 },
});

const RateLimitHit = mongoose.models.RateLimitHit || mongoose.model("RateLimitHit", rateLimitHitSchema);

export default RateLimitHit;
