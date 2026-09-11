import logger from "../utils/logger.js";

// Always responds with a safe, generic message/code. Technical detail (driver error names,
// Mongo error codes) goes only to server logs, and never the original error message/stack —
// those can embed submitted field values (e.g. a Mongoose CastError message includes the
// offending value) — so they are deliberately excluded even from logs.
export default function errorHandler(err, req, res, _next) {
  const requestId = req.requestId;

  if (err?.isApiError) {
    if (err.statusCode >= 500) {
      logger.error("api_error", { requestId, code: err.code, statusCode: err.statusCode });
    }
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.details ? { errors: err.details } : {}),
    });
  }

  // express.json() surfaces malformed JSON / oversized bodies as http-errors-style errors
  // (err.status set, err.type identifies the cause) rather than throwing an ApiError.
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      success: false,
      message: "Request payload is too large.",
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      message: "Request body is not valid JSON.",
      code: "MALFORMED_JSON",
    });
  }

  if (err?.message === "Not allowed by CORS") {
    logger.warn("cors_rejected", { requestId, origin: req.headers.origin });
    return res.status(403).json({
      success: false,
      message: "This origin is not permitted to access this API.",
      code: "CORS_NOT_ALLOWED",
    });
  }

  logger.error("unhandled_error", {
    requestId,
    name: err?.name,
    mongoErrorCode: err?.code,
  });

  return res.status(500).json({
    success: false,
    message: "Unable to process request.",
    code: "INTERNAL_ERROR",
  });
}
