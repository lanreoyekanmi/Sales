import { Router } from "express";
import { createApplication, uploadApplicationDocument } from "../controllers/application.controller.js";
import { applicationSubmissionLimiter, documentUploadLimiter } from "../middleware/rateLimiter.js";
import { applicationUpload, documentUpload } from "../middleware/upload.js";

const router = Router();

// Intentionally the only two routes on this resource: no GET /:id (no public retrieval of
// applicant data by ID) and no GET / (no public listing/enumeration of applications).
// See BACKEND/docs/applications-api.md for why retrieval is deliberately out of scope.
//
// multipart/form-data, not JSON: the application data travels in a "data" field (a JSON
// string) alongside the three required image files, so the whole submission — application
// fields and verification images together — either succeeds or fails as one unit.
router.post("/", applicationSubmissionLimiter, applicationUpload, createApplication);

// Write-only: replaces one previously submitted verification image (e.g. a retake after a
// blurry capture) on an application that already has all three. Knowledge of applicationId
// is the only access control here, same trust model as the Idempotency-Key header above — it
// grants no read access to any applicant data, just permission to replace one document image
// on that specific application.
router.post(
  "/:applicationId/documents",
  documentUploadLimiter,
  documentUpload,
  uploadApplicationDocument
);

export default router;
