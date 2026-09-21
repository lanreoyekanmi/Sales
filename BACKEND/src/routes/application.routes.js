import { Router } from "express";
import { createApplication, uploadApplicationDocument } from "../controllers/application.controller.js";
import { initApplicationUploads, initDocumentUpload } from "../controllers/uploadInit.controller.js";
import { applicationSubmissionLimiter, documentUploadLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Intentionally the only routes on this resource: no GET /:id (no public retrieval of
// applicant data by ID) and no GET / (no public listing/enumeration of applications).
// See BACKEND/docs/applications-api.md for why retrieval is deliberately out of scope.
//
// Step 1 of submission: issues an applicationId and signed direct-to-Cloudinary upload targets
// for the three required images. The browser uploads straight to Cloudinary with these (never
// through this server — see services/cloudinaryStorage.adapter.js) before calling POST / below.
router.post("/uploads/init", applicationSubmissionLimiter, initApplicationUploads);

// Step 2: plain JSON — the application data plus the applicationId from step 1. The service
// layer fetches the three uploaded images back from Cloudinary itself; nothing here trusts a
// Cloudinary identifier supplied by the client (see services/application.service.js).
router.post("/", applicationSubmissionLimiter, createApplication);

// Write-only: replaces one previously submitted verification image (e.g. a retake after a
// blurry capture) on an application that already has all three. Knowledge of applicationId
// is the only access control here, same trust model as the Idempotency-Key header above — it
// grants no read access to any applicant data, just permission to replace one document image
// on that specific application. Same two-step (init, then confirm) shape as the routes above.
router.post("/:applicationId/documents/init", documentUploadLimiter, initDocumentUpload);

router.post("/:applicationId/documents", documentUploadLimiter, uploadApplicationDocument);

export default router;
