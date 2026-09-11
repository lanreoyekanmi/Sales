export default class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.isApiError = true;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
