import app from "../BACKEND/src/app.js";
import connectDB from "../BACKEND/src/config/database.js";

// Vercel entrypoint: every request under /api/* is routed to this single Function (the
// [...path] catch-all filename), which just delegates to the existing Express app — no routes,
// controllers, or services are duplicated here. app.js never calls .listen(); Vercel owns the
// HTTP server, and Express apps are directly callable as a (req, res) request handler.
export default async function handler(req, res) {
  try {
    await connectDB();
  } catch {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Unable to process request.", code: "INTERNAL_ERROR" }));
    return;
  }

  return app(req, res);
}
