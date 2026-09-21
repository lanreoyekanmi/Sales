import { cloudinaryStorage } from "../services/cloudinaryStorage.adapter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import { generateApplicationId, isValidApplicationId } from "../utils/applicationId.js";
import { DOCUMENT_KINDS, DOCUMENT_UPLOAD_FIELDS } from "../config/constants.js";

// Issues a fresh applicationId plus a signed direct-to-Cloudinary upload target for each of the
// three required document fields. The browser uploads the raw files straight to Cloudinary with
// these (bypassing the Vercel Function request body — see services/application.service.js for
// why), then calls POST /api/applications with only the applicationId and the applicant data.
// No Cloudinary API secret ever reaches the response — only a signature computed with it.
export const initApplicationUploads = asyncHandler(async (_req, res) => {
  const applicationId = generateApplicationId();

  const uploads = {};
  for (const [field, kind] of Object.entries(DOCUMENT_UPLOAD_FIELDS)) {
    const publicId = cloudinaryStorage.buildStagingPublicId(applicationId, kind, "staging");
    uploads[field] = cloudinaryStorage.signStagingUpload(publicId);
  }

  return res.status(201).json({ success: true, applicationId, uploads });
});

// Same idea as above, scoped to a single document kind on an application that already exists —
// used before a document retake (POST /api/applications/:applicationId/documents).
export const initDocumentUpload = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  if (!isValidApplicationId(applicationId)) {
    throw new ApiError(404, "APPLICATION_NOT_FOUND", "No application was found for this ID.");
  }

  const { kind } = req.body ?? {};
  if (!DOCUMENT_KINDS.includes(kind)) {
    throw new ApiError(400, "VALIDATION_ERROR", "A valid document 'kind' is required.", [
      { field: "kind", message: `kind must be one of: ${DOCUMENT_KINDS.join(", ")}` },
    ]);
  }

  const exists = await Application.exists({ applicationId });
  if (!exists) {
    throw new ApiError(404, "APPLICATION_NOT_FOUND", "No application was found for this ID.");
  }

  const publicId = cloudinaryStorage.buildStagingPublicId(applicationId, kind, "retake-staging");
  const upload = cloudinaryStorage.signStagingUpload(publicId);

  return res.status(201).json({ success: true, upload });
});
