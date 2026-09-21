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

// Deterministic (no random suffix, unlike buildPublicId above): the browser uploads its raw,
// not-yet-processed file directly to Cloudinary (bypassing the Vercel Function body-size limit
// entirely — see services/application.service.js), and the server must be able to locate that
// upload from applicationId + kind alone without trusting any Cloudinary identifier the client
// might echo back. `tag` separates the initial-submission staging slot from the retake staging
// slot so a retake-in-progress never collides with the original upload for the same kind.
function buildStagingPublicId(applicationId, kind, tag = "staging") {
  return `${UPLOAD_FOLDER}/${applicationId}/${kind}-${tag}`;
}

// The Cloudinary Node SDK rejects with a plain object, not an Error instance.
function isCloudinaryNotFound(err) {
  return err?.error?.http_code === 404 || err?.http_code === 404;
}

export const STAGED_UPLOAD_NOT_FOUND = "STAGED_UPLOAD_NOT_FOUND";

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

  buildStagingPublicId,

  // Returns everything the browser needs to upload directly to Cloudinary — never the API
  // secret itself, only a signature computed with it. No format is forced here: the browser's
  // original file is stored as-is, and the authoritative decode/validate/strip/re-encode still
  // happens server-side in processUploadedImage once fetchStagedUpload pulls the bytes back.
  // `overwrite`/`invalidate` matter because a staging public_id can legitimately be reused (a
  // retry after a validation error, or a second retake attempt) — without them, Cloudinary's
  // default upload behavior can silently keep the *previous* upload's bytes at that public_id
  // instead of replacing them with the new file, which would mean processing/storing stale,
  // already-superseded image data. All three overwrite-affecting params must be included in
  // both the signature and the form the browser actually sends — Cloudinary rejects the
  // signature otherwise.
  signStagingUpload(publicId) {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = { public_id: publicId, timestamp, type: "authenticated", overwrite: true, invalidate: true };
    const { api_key: apiKey, api_secret: apiSecret, cloud_name: cloudName } = cloudinary.config();
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      type: "authenticated",
      overwrite: true,
      invalidate: true,
    };
  },

  // Fetches the raw bytes of a not-yet-processed browser upload back from Cloudinary
  // (server-to-server — never through the Vercel Function's request body, so the platform's
  // request size limit does not apply here). Throws an error with `.code ===
  // STAGED_UPLOAD_NOT_FOUND` if applicationId/kind never actually reached Cloudinary — the
  // signal used to reject an applicationId that was never obtained from a real
  // POST /api/applications/uploads/init call.
  async fetchStagedUpload(publicId) {
    let resource;
    try {
      resource = await cloudinary.api.resource(publicId, { resource_type: "image", type: "authenticated" });
    } catch (err) {
      if (isCloudinaryNotFound(err)) {
        const notFound = new Error(STAGED_UPLOAD_NOT_FOUND);
        notFound.code = STAGED_UPLOAD_NOT_FOUND;
        throw notFound;
      }
      throw err;
    }

    // A staging public_id is deterministic and can legitimately be overwritten (a retry after a
    // validation error re-uses the exact same slot — see signStagingUpload's `overwrite` note
    // above). Pinning the delivery URL to this exact resource `version` (which changes on every
    // overwrite) guarantees a fresh fetch even if Cloudinary's CDN hasn't yet propagated the
    // `invalidate: true` purge for the previous version at this same public_id/URL.
    const url = cloudinary.url(publicId, {
      resource_type: "image",
      type: "authenticated",
      format: resource.format,
      version: resource.version,
      sign_url: true,
    });
    const res = await fetch(url);
    if (!res.ok) {
      const notFound = new Error(STAGED_UPLOAD_NOT_FOUND);
      notFound.code = STAGED_UPLOAD_NOT_FOUND;
      throw notFound;
    }

    return { buffer: Buffer.from(await res.arrayBuffer()), bytes: resource.bytes };
  },
};
