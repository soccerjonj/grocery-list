import { createClient } from "@/lib/supabase/client";

const BUCKET = "recipe-images";
/** Longest edge after downscaling — plenty for a card or hero at 2x. */
const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.82;

/**
 * Downscale + re-encode in the browser before upload, using canvas so we add
 * no dependency. A modern phone photo is 3–8 MB; this lands around 150–300 KB.
 * That matters three ways: upload succeeds on bad signal, storage cost stays
 * negligible, and the image renders fast in a list.
 *
 * Re-encoding to JPEG also strips EXIF — including GPS coordinates, which you
 * do not want to publish just because you photographed a recipe card at home.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file; // No canvas support — fall back to the original.
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  return blob ?? file;
}

export interface UploadedImage {
  /** Public URL to render. */
  url: string;
  /** Storage path, kept so the old object can be removed on replace/delete. */
  path: string;
}

/**
 * Upload a recipe photo. Path is `<householdId>/<uuid>.jpg` — the household
 * prefix is what migration 029's RLS checks, so a member can only ever write
 * into their own household's folder.
 */
export async function uploadRecipeImage(
  householdId: string,
  file: File,
): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image");

  const blob = await downscale(file);
  const path = `${householdId}/${crypto.randomUUID()}.jpg`;
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message || "Couldn't upload that photo");

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Best-effort cleanup of a replaced/removed photo. Never throws: failing to
 * delete an orphan must not block saving the recipe.
 */
export async function deleteRecipeImage(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await createClient().storage.from(BUCKET).remove([path]);
  } catch {
    /* orphaned object — harmless */
  }
}
