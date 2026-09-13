// Mirrors BACKEND/docs/applications-api.md. Keep in sync with that document, not the other
// way around — the backend is the source of truth for response shape.

export interface ApplicationFieldError {
  field: string;
  message: string;
}

export interface ApplicationSuccessResponse {
  success: true;
  message: string;
  applicationId: string;
}

export interface ApplicationErrorResponse {
  success: false;
  message: string;
  code: string;
  errors?: ApplicationFieldError[];
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_IDEMPOTENCY_KEY"
  | "MALFORMED_JSON"
  | "CORS_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNEXPECTED_RESPONSE";

// Thrown by the API client for every failure mode: server-reported errors (parsed defensively
// from a JSON or non-JSON body) as well as client-side failures (network down, timeout,
// response shape we don't recognize). `message` is always safe to show to the applicant.
export class ApplicationApiError extends Error {
  code: ApiErrorCode;
  fieldErrors?: ApplicationFieldError[];
  status?: number;

  constructor(message: string, code: ApiErrorCode, options?: { status?: number; fieldErrors?: ApplicationFieldError[] }) {
    super(message);
    this.name = "ApplicationApiError";
    this.code = code;
    this.status = options?.status;
    this.fieldErrors = options?.fieldErrors;
  }
}
