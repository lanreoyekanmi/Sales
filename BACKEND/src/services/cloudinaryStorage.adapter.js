import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import cloudinary from "../config/cloudinary.js";

const UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || "loan-applications";

// applicationId is always our own server-generated UUID and kind is always one of a fixed
// enum validated upstream — neither is attacker-controlled, so this public_id carries no
// path-traversal/arbitrary-folder risk, and the client never supplies a folder or public_id
// directly. Every upload gets a fresh, unique public_id rather than a stable one reused
// across retakes: a retake (documentUpload.service.js) must not overwrite the asset a
// previous, already-committed MongoDB record still points to — the old asset has to stay
// servable until the new MongoDB write actually commits, which isn't possible if the retake
// upload destroys it on arrival.
function buildPublicId(applicationId, kind) {
  return `${UPLOAD_FOLDER}/${applicationId}/${kind}-${randomUUID()}`;
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    Readable.from(buffer).pipe(uploadStream);
  });
}

// Exported as an object (not bare named functions) so tests can use node:test's built-in
// t.mock.method() to simulate a Cloudinary outage without a mocking library or real network
// failure injection — see document.upload.test.js / application.api.test.js.
export const cloudinaryStorage = {
  async uploadDocumentFile({ applicationId, kind, buffer }) {
    const result = await uploadBuffer(buffer, {
      public_id: buildPublicId(applicationId, kind),
      resource_type: "image",
      // "authenticated" delivery: the asset is not reachable at a plain public URL. Retrieving
      // it later requires a signed, short-lived URL generated server-side — see
      // BACKEND/docs/applications-api.md for what that still requires (no such retrieval
      // endpoint exists yet; none is added by this change).
      type: "authenticated",
      format: "jpg",
      overwrite: true,
      invalidate: true,
    });

    return {
      publicId: result.public_id,
      resourceType: result.resource_type,
      deliveryType: result.type,
      format: result.format,
      bytes: result.bytes,
    };
  },

  async deleteDocumentFile({ publicId, resourceType = "image", deliveryType = "authenticated" }) {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: deliveryType,
    });
  },
};
