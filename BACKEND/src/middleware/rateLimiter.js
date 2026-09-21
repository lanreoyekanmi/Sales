import { mongoRateLimit } from "./mongoRateLimiter.js";

// Configurable via env so limits can be tuned per deployment without a code change.
const WINDOW_MS = Number(process.env.APPLICATION_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const MAX_REQUESTS = Number(process.env.APPLICATION_RATE_LIMIT_MAX) || 10;

// Shared by both steps of a submission (the upload-init call and the final create call) so a
// client cannot bypass the limit by only ever calling init and abandoning the rest.
export const applicationSubmissionLimiter = mongoRateLimit({
  scope: "application_submission",
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  message: "Too many applications submitted from this network. Please try again later.",
});

const DOCUMENT_UPLOAD_WINDOW_MS =
  Number(process.env.DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const DOCUMENT_UPLOAD_MAX_REQUESTS = Number(process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX) || 20;

// Shared by both steps of a document retake (init + confirm), same rationale as above.
export const documentUploadLimiter = mongoRateLimit({
  scope: "document_upload",
  windowMs: DOCUMENT_UPLOAD_WINDOW_MS,
  max: DOCUMENT_UPLOAD_MAX_REQUESTS,
  message: "Too many document uploads from this network. Please try again later.",
});
