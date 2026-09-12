import sharp from "sharp";

const MAX_DIMENSION_PX = 4000;
const MIN_DIMENSION_PX = 200;
const JPEG_QUALITY = 85;

export class InvalidImageError extends Error {}

// Re-encodes every upload through sharp instead of trusting the declared Content-Type or
// storing the original bytes. This does several things at once: it proves the data actually
// decodes as a raster image (a renamed non-image file fails here, not just a mimetype check),
// discards all metadata (EXIF/GPS, device info) that phone cameras routinely embed in ID
// photos and selfies, caps runaway dimensions, and rejects images too small to plausibly be a
// usable ID/selfie photo (e.g. a 1x1 pixel placeholder).
export async function processUploadedImage(buffer) {
  let output, info;
  try {
    // { resolveWithObject: true } returns both the encoded bytes and the final width/height
    // in one decode pass, rather than a separate metadata() probe plus a second full decode.
    ({ data: output, info } = await sharp(buffer, { failOn: "error" })
      .rotate() // bake in EXIF orientation before the metadata carrying it is stripped below
      .resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    // A header-only probe can succeed on a file whose pixel data is truncated or corrupt —
    // the real decode only happens once something actually reads the pixels, which is what
    // resize/encode above does. Any failure here is reported as the same clean 400, never a
    // raw sharp/libvips error reaching the client as an unhandled 500.
    throw new InvalidImageError("The uploaded file is not a valid image.");
  }

  if (info.width < MIN_DIMENSION_PX || info.height < MIN_DIMENSION_PX) {
    throw new InvalidImageError(
      `Image must be at least ${MIN_DIMENSION_PX}x${MIN_DIMENSION_PX} pixels.`
    );
  }

  return { buffer: output };
}
