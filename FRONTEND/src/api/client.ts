import { ApplicationApiError, type ApiErrorCode, type ApplicationErrorResponse } from "./types";

const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

// Fail loudly in development if the base URL is missing, instead of silently calling a relative
// path that happens to 404. In production this should always be set at build time.
if (!RAW_BASE_URL && import.meta.env.DEV) {
  console.warn(
    "[api] VITE_API_BASE_URL is not set. Copy FRONTEND/.env.example to FRONTEND/.env and set it to your backend's URL."
  );
}

export const API_BASE_URL = (RAW_BASE_URL ?? "").replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 30_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeErrorResponse(value: unknown): value is ApplicationErrorResponse {
  return (
    isPlainRecord(value) &&
    value.success === false &&
    typeof value.message === "string" &&
    typeof value.code === "string"
  );
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    return await res.json();
  } catch {
    // Body claimed to be JSON but wasn't parseable — treat as no usable body.
    return undefined;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * POSTs a JSON body and returns the parsed JSON body on success. Throws ApplicationApiError for
 * every failure mode (network, timeout, non-2xx, unexpected shape) with a message that is
 * always safe to render to the applicant.
 */
export async function postJson<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApplicationApiError(
      "This application isn't configured correctly. Please try again later.",
      "UNEXPECTED_RESPONSE"
    );
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      // Never cache a submission request/response — it carries sensitive applicant data.
      cache: "no-store",
      credentials: "omit",
      headers: { ...options.headers, "Content-Type": "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApplicationApiError(
        "The request took too long to complete. Please check your connection and try again.",
        "TIMEOUT"
      );
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApplicationApiError("The request was cancelled.", "TIMEOUT");
    }
    throw new ApplicationApiError(
      "We couldn't reach the server. Please check your internet connection and try again.",
      "NETWORK_ERROR"
    );
  } finally {
    clearTimeout(timeout);
  }

  const body_ = await parseResponseBody(res);

  if (!res.ok) {
    if (looksLikeErrorResponse(body_)) {
      throw new ApplicationApiError(body_.message, body_.code as ApiErrorCode, {
        status: res.status,
        fieldErrors: body_.errors,
      });
    }
    throw new ApplicationApiError(genericMessageForStatus(res.status), "UNEXPECTED_RESPONSE", {
      status: res.status,
    });
  }

  if (body_ === undefined) {
    throw new ApplicationApiError(
      "The server returned an unexpected response. Please try again.",
      "UNEXPECTED_RESPONSE",
      { status: res.status }
    );
  }

  return body_ as T;
}

function genericMessageForStatus(status: number): string {
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status === 413) return "Your submission is too large. Please check your uploaded files.";
  if (status >= 500) return "Something went wrong on our end. Please try again shortly.";
  return "We couldn't process your submission. Please review your information and try again.";
}
