/**
 * Re-encodes an image from its decoded pixels, so nothing from the original
 * file survives: no EXIF, GPS, camera serial, XMP edit history, or embedded
 * thumbnail (which can still show a face that was cropped or blurred out of
 * the main picture). Orientation is applied first, since the tag that carried
 * it is dropped.
 *
 * It cannot remove what is in the picture itself, or the sensor-noise pattern
 * forensic tools use to match a photo to a camera.
 */

/** What every current browser can decode. HEIC is not on it outside Safari. */
export const SCRUBBABLE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const MAX_EDGE = 2400;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type ScrubbedImage = { blob: Blob; type: string; extension: string; width: number; height: number };

const encode = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));

export async function scrubImage(file: Blob): Promise<ScrubbedImage> {
  if (!SCRUBBABLE_TYPES.includes(file.type)) {
    throw new Error("Only JPEG, PNG, GIF and WebP images can be published. Export the image as JPEG or PNG.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("An image could not be read. Export it as JPEG or PNG and try again.");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser cannot process images. Try another browser.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Photographs stay JPEG; anything that may carry transparency goes to WebP.
  // A browser that cannot encode WebP hands back PNG, which is just as clean.
  const blob = await encode(canvas, file.type === "image/jpeg" ? "image/jpeg" : "image/webp");
  canvas.width = 0;
  canvas.height = 0;
  if (!blob || !EXTENSIONS[blob.type]) throw new Error("An image could not be prepared for upload.");
  return { blob, type: blob.type, extension: EXTENSIONS[blob.type], width, height };
}
