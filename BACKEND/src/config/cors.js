const isProduction = process.env.NODE_ENV === "production";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    "[config/cors] ALLOWED_ORIGINS is not set in production. All cross-origin browser requests will be blocked."
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
