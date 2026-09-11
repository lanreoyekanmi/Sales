import rateLimit from "express-rate-limit";

// Configurable via env so limits can be tuned per deployment without a code change.
const WINDOW_MS = Number(process.env.APPLICATION_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const MAX_REQUESTS = Number(process.env.APPLICATION_RATE_LIMIT_MAX) || 10;

export const applicationSubmissionLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many applications submitted from this network. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});
