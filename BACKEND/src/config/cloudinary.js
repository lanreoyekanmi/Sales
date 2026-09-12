import { v2 as cloudinary } from "cloudinary";

const REQUIRED_VARS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Fails at import time (i.e. at server startup, since this is imported transitively from
  // app.js) rather than on the first upload request — a missing secret should stop the
  // server from coming up at all, not surface as a confusing runtime error later.
  throw new Error(
    `Missing required Cloudinary configuration: ${missing.join(", ")}. See .env.example.`
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
