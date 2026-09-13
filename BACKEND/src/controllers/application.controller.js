import { ZodError } from "zod";
import { applicationSubmissionSchema } from "../validators/application.validator.js";
import { submitApplication } from "../services/application.service.js";
import { uploadApplicationDocument as uploadDocument } from "../services/documentUpload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { DOCUMENT_KINDS, DOCUMENT_UPLOAD_FIELDS } from "../config/constants.js";
import { isValidApplicationId } from "../utils/applicationId.js";

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

export const createApplication = asyncHandler(async (req, res) => {
  // multer (applicationUpload) has already run: text fields are on req.body, the three
  // required images are on req.files. The JSON payload travels in a single "data" field
  // since the request as a whole is multipart/form-data, not application/json.
  let rawData;
  try {
    rawData = JSON.parse(req.body?.data ?? "");
  } catch {
    throw new ApiError(400, "MALFORMED_JSON", "The 'data' field is not valid JSON.");
  }

  let input;
  try {
    input = applicationSubmissionSchema.parse(rawData);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "The submitted application data is invalid.",
        err.issues.map((issue) => ({
          field: issue.path.join(".") || "(root)",
          message: issue.message,
        }))
      );
    }
    throw err;
  }

  const missingFields = Object.keys(DOCUMENT_UPLOAD_FIELDS).filter(
    (field) => !req.files?.[field]?.[0]
  );
  if (missingFields.length > 0) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "All verification images (ID card, SSN card, selfie) are required.",
      missingFields.map((field) => ({ field, message: `${field} is required.` }))
    );
  }

  const idempotencyKey = req.header("Idempotency-Key");
  if (idempotencyKey && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
    throw new ApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key header format is invalid."
    );
  }

  const files = Object.fromEntries(
    Object.entries(DOCUMENT_UPLOAD_FIELDS).map(([field, kind]) => [
      kind,
      req.files[field][0].buffer,
    ])
  );

  const result = await submitApplication(input, {
    idempotencyKey,
    sourceIp: req.ip,
    userAgent: req.get("user-agent")?.slice(0, 300),
    requestId: req.requestId,
    files,
  });

  // Only ever return the minimal confirmation — never the stored record, applicant data,
  // or loan history, regardless of whether this was a fresh submission or an idempotent replay.
  return res.status(201).json({
    success: true,
    message: "Application submitted successfully.",
    applicationId: result.applicationId,
  });
});

export const uploadApplicationDocument = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  // Same 404 regardless of whether the ID is malformed or just unknown — no signal either way.
  // Accepts both the current human-readable format and the legacy UUID format still used by
  // applications created before it existed (see utils/applicationId.js).
  if (!isValidApplicationId(applicationId)) {
    throw new ApiError(404, "APPLICATION_NOT_FOUND", "No application was found for this ID.");
  }

  const { kind } = req.body;
  if (!DOCUMENT_KINDS.includes(kind)) {
    throw new ApiError(400, "VALIDATION_ERROR", "A valid document 'kind' is required.", [
      { field: "kind", message: `kind must be one of: ${DOCUMENT_KINDS.join(", ")}` },
    ]);
  }

  if (!req.file) {
    throw new ApiError(400, "VALIDATION_ERROR", "An image file is required.", [
      { field: "image", message: "An 'image' file part is required." },
    ]);
  }

  const result = await uploadDocument({
    applicationId,
    kind,
    buffer: req.file.buffer,
    requestId: req.requestId,
  });

  // Minimal confirmation only — never the storage key, checksum, or any other application data.
  return res.status(201).json({
    success: true,
    message: "Document uploaded successfully.",
    kind: result.kind,
  });
});
