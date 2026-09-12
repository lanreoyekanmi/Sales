import multer from "multer";
import { DOCUMENT_UPLOAD_FIELDS } from "../config/constants.js";

const MAX_DOCUMENT_UPLOAD_SIZE_BYTES =
  Number(process.env.MAX_DOCUMENT_UPLOAD_SIZE_BYTES) || 8 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// This is just an early, cheap rejection — the authoritative check is the actual decode
// attempt in imageProcessing.js, since a client can declare any Content-Type it likes for a
// file part. Memory storage only: raw uploads are never written to disk as-is; they are
// re-encoded (and stripped of EXIF/GPS metadata) before anything is persisted.
function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("UNSUPPORTED_FILE_TYPE"));
  }
  cb(null, true);
}

const storage = multer.memoryStorage();

// POST /api/applications: all three verification images are required in the same request
// that creates the application — the application is never persisted without them.
export const applicationUpload = multer({
  storage,
  limits: { fileSize: MAX_DOCUMENT_UPLOAD_SIZE_BYTES, files: 3 },
  fileFilter,
}).fields(Object.keys(DOCUMENT_UPLOAD_FIELDS).map((name) => ({ name, maxCount: 1 })));

// POST /api/applications/:applicationId/documents: replaces one previously submitted image
// (e.g. a retake after a blurry capture) on an application that already has all three.
export const documentUpload = multer({
  storage,
  limits: { fileSize: MAX_DOCUMENT_UPLOAD_SIZE_BYTES, files: 1 },
  fileFilter,
}).single("image");
