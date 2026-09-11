import mongoose from "mongoose";

// Stores monetary values as MongoDB Decimal128 (never floating point) to avoid
// rounding drift on amounts. Input is already range/type validated by zod before this runs.
export function toDecimal128(value) {
  if (value === undefined || value === null) return undefined;
  return mongoose.Types.Decimal128.fromString(Number(value).toFixed(2));
}
