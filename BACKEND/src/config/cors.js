const isProduction = process.env.NODE_ENV === "production";

// Always allowed in production, regardless of ALLOWED_ORIGINS, so a missing/incomplete env var
// on the hosting platform (e.g. Railway) can't silently break the deployed frontend.
const PRODUCTION_FRONTEND_ORIGIN = "https://meridianloan.vercel.app";

const envOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = isProduction
  ? Array.from(new Set([PRODUCTION_FRONTEND_ORIGIN, ...envOrigins]))
  : envOrigins;

if (isProduction && envOrigins.length === 0) {
  console.warn(
    "[config/cors] ALLOWED_ORIGINS is not set in production. Only the default production origin will be allowed."
  );
}

export const corsOptions = {
  origin(origin, callback) {
    // Requests with no Origin header (server-to-server, curl, same-origin) are allowed through;
    // browsers always send Origin for cross-site fetch/XHR, so this does not weaken CORS enforcement.
    if (!origin) return callback(null, true);

    if (!isProduction && allowedOrigins.length === 0) {
      // Permissive default for local development only, so the API is usable before ALLOWED_ORIGINS is configured.
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Idempotency-Key"],
  optionsSuccessStatus: 204,
};
