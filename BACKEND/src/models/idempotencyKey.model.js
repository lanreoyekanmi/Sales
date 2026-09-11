import mongoose from "mongoose";

const { Schema } = mongoose;

const IDEMPOTENCY_KEY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// Caches the safe response returned for a given client-supplied Idempotency-Key so that
// retried POST /api/applications requests (double-click, network retry) replay the same
// result instead of creating a duplicate application record.
const idempotencyKeySchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  applicationId: { type: String, required: true },
  response: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: IDEMPOTENCY_KEY_TTL_SECONDS },
});

const IdempotencyKey = mongoose.model("IdempotencyKey", idempotencyKeySchema);

export default IdempotencyKey;
