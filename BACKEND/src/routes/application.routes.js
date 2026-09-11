import { Router } from "express";
import { createApplication } from "../controllers/application.controller.js";
import { applicationSubmissionLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// Intentionally the only route on this resource: no GET /:id (no public retrieval of
// applicant data by ID) and no GET / (no public listing/enumeration of applications).
// See BACKEND/docs/applications-api.md for why retrieval is deliberately out of scope.
router.post("/", applicationSubmissionLimiter, createApplication);

export default router;
