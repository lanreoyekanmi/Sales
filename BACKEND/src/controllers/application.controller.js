import { ZodError } from "zod";
import { applicationSubmissionSchema } from "../validators/application.validator.js";
import { submitApplication } from "../services/application.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

export const createApplication = asyncHandler(async (req, res) => {
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
