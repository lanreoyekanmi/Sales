import { ZodError } from "zod";
import { applicationSubmissionSchema } from "../validators/application.validator.js";
import { submitApplication } from "../services/application.service.js";
import { uploadApplicationDocument as uploadDocument } from "../services/documentUpload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { DOCUMENT_KINDS } from "../config/constants.js";
import { isValidApplicationId } from "../utils/applicationId.js";

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

export const createApplication = asyncHandler(async (req, res) => {
  // The three required images already reached Cloudinary directly from the browser (see
  // POST /api/applications/uploads/init) — this request is plain JSON, no multipart, no file
  // parts. express.json() has already parsed the body onto req.body.
  let input;
  try {
    input = applicationSubmissionSchema.parse(req.body);
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

  const idempotencyKey = req.header("Idempotency-Key");
  if (idempotencyKey && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
    throw new ApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key header format is invalid."
    );
  }

  const result = await submitApplication(input, {
    idempotencyKey,
    sourceIp: req.ip,
    userAgent: req.get("user-agent")?.slice(0, 300),
    requestId: req.requestId,
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

  const { kind } = req.body ?? {};
  if (!DOCUMENT_KINDS.includes(kind)) {
    throw new ApiError(400, "VALIDATION_ERROR", "A valid document 'kind' is required.", [
      { field: "kind", message: `kind must be one of: ${DOCUMENT_KINDS.join(", ")}` },
    ]);
  }

  const result = await uploadDocument({
    applicationId,
    kind,
    requestId: req.requestId,
  });

  // Minimal confirmation only — never the storage key, checksum, or any other application data.
  return res.status(201).json({
    success: true,
    message: "Document uploaded successfully.",
    kind: result.kind,
  });
});
