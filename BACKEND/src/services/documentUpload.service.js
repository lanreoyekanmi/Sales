import Application from "../models/application.model.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import { processUploadedImage, InvalidImageError } from "../utils/imageProcessing.js";
import { cloudinaryStorage, STAGED_UPLOAD_NOT_FOUND } from "./cloudinaryStorage.adapter.js";
import { MAX_DOCUMENT_UPLOAD_SIZE_BYTES } from "../config/constants.js";

/**
 * @param {object} params - { applicationId, kind, requestId }
 *   The replacement image itself already reached Cloudinary directly from the browser via
 *   POST /api/applications/:applicationId/documents/init — this call fetches it back, processes
 *   it, and only then touches MongoDB.
 */
export async function uploadApplicationDocument({ applicationId, kind, requestId }) {
  // publicId is select:false on the schema — this is the one place that needs it, to know
  // what to clean up afterward, so it must be explicitly opted back in.
  const application = await Application.findOne({ applicationId })
    .select("+documents.publicId")
    .lean();
  if (!application) {
    // Deliberately the same generic message/code regardless of whether the ID is merely
    // well-formed-but-unknown or malformed — this endpoint gives no signal either way.
    throw new ApiError(404, "APPLICATION_NOT_FOUND", "No application was found for this ID.");
  }

  const stagingPublicId = cloudinaryStorage.buildStagingPublicId(applicationId, kind, "retake-staging");
  let staged;
  try {
    staged = await cloudinaryStorage.fetchStagedUpload(stagingPublicId);
  } catch (err) {
    if (err?.code === STAGED_UPLOAD_NOT_FOUND) {
      throw new ApiError(400, "VALIDATION_ERROR", "An image file is required.", [
        { field: "image", message: "An 'image' file part is required." },
      ]);
    }
    throw err;
  }

  if (staged.bytes > MAX_DOCUMENT_UPLOAD_SIZE_BYTES) {
    await cloudinaryStorage.deleteDocumentFile({ publicId: stagingPublicId }).catch(() => {});
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Uploaded file is too large.");
  }

  let processed;
  try {
    processed = await processUploadedImage(staged.buffer);
  } catch (err) {
    if (err instanceof InvalidImageError) {
      await cloudinaryStorage.deleteDocumentFile({ publicId: stagingPublicId }).catch(() => {});
      throw new ApiError(400, "INVALID_IMAGE", "The uploaded file is not a valid image.");
    }
    throw err;
  }

  const previousDocument = application.documents.find((doc) => doc.kind === kind);

  // cloudinaryStorage.adapter.js gives every upload a fresh, unique public_id — this call
  // never overwrites the asset currently referenced by the application. Cloudinary and
  // MongoDB are separate systems with no shared transaction, so the previous asset (and the
  // metadata pointing at it) must stay exactly as they are until the MongoDB write below has
  // actually committed. Only once that succeeds is the previous asset deleted; if the MongoDB
  // write fails instead, this newly uploaded asset is deleted and nothing about the
  // application changes at all.
  const uploaded = await cloudinaryStorage.uploadDocumentFile({ applicationId, kind, buffer: processed.buffer });

  const uploadedAt = new Date();
  const documentEntry = {
    kind,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
    deliveryType: uploaded.deliveryType,
    format: uploaded.format,
    bytes: uploaded.bytes,
    uploadedAt,
  };

  try {
    // A single atomic update — not the previous two-step $pull then $push — so there is no
    // intermediate state where the array is briefly missing an entry for this kind if the
    // process were to fail between steps. arrayFilters targets the existing element for this
    // kind directly; every application created by the main submission flow already has one
    // entry per required kind, so this is expected to always match.
    const result = await Application.updateOne(
      { applicationId, "documents.kind": kind },
      { $set: { "documents.$[elem]": documentEntry } },
      { arrayFilters: [{ "elem.kind": kind }] }
    );

    // Defensive fallback only — not expected in normal operation, since every application
    // already has all three document kinds from creation (see application.model.js's
    // document-completeness validator). Heals a missing entry rather than silently no-op'ing.
    if (result.matchedCount === 0) {
      await Application.updateOne({ applicationId }, { $push: { documents: documentEntry } });
    }
  } catch (err) {
    await cloudinaryStorage.deleteDocumentFile(uploaded).catch(() => {});
    // Same reasoning as the finally block in application.service.js's submitApplication: a
    // failed attempt must never leave stale bytes sitting at this deterministic staging
    // public_id for a later retry to silently reuse.
    await cloudinaryStorage.deleteDocumentFile({ publicId: stagingPublicId }).catch(() => {});
    logger.warn("document_replace_rolled_back", { requestId, applicationId, kind });
    throw err;
  }

  // The MongoDB write committed successfully, so the application now correctly points at the
  // new asset — only now is it safe to delete the one it replaced. Best-effort: if this
  // specific delete fails, the result is an old, no-longer-referenced asset left in
  // Cloudinary, never any inconsistency in what the application actually points to.
  if (previousDocument?.publicId) {
    cloudinaryStorage.deleteDocumentFile(previousDocument).catch(() => {
      logger.warn("previous_document_cleanup_failed", { requestId, applicationId, kind });
    });
  }

  // The raw staging upload is no longer needed now that the processed version is the asset of
  // record — best-effort, same fire-and-forget cleanup style as the previous-document delete
  // above.
  cloudinaryStorage.deleteDocumentFile({ publicId: stagingPublicId }).catch(() => {});

  logger.info("application_document_uploaded", { requestId, applicationId, kind });

  return { kind, uploadedAt };
}
