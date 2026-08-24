"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createMediaFolder, cropMedia, deleteMedia, deleteMediaFolder, resizeMedia, updateMedia, uploadMedia,
} from "@/lib/admin";

export type MediaState = { error?: string; uploaded?: string };

/** Turns an ApiError into something an editor can act on. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 422) {
      return Object.values(error.errors ?? {})[0]?.[0] ?? error.message;
    }
    return error.message || fallback;
  }
  return fallback;
}

export async function uploadMediaAction(_prev: MediaState, formData: FormData): Promise<MediaState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  try {
    const media = await uploadMedia(formData);
    revalidatePath("/admin/media");
    return { uploaded: media.filename };
  } catch (error) {
    return { error: reason(error, "That upload failed. Try again.") };
  }
}

export async function deleteMediaAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  // Nothing tracks which records reference a file, so this cannot warn about
  // what it will break. The confirmation says so plainly instead.
  await deleteMedia(id).catch(() => null);
  revalidatePath("/admin/media");
  redirect(back(formData, "deleted=1"));
}

export type FolderState = { error?: string; ok?: string };

export async function createFolderAction(_prev: FolderState, formData: FormData): Promise<FolderState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the folder a name." };

  try {
    await createMediaFolder(name);
    revalidatePath("/admin/media");
    return { ok: name };
  } catch (error) {
    return { error: reason(error, "That folder could not be created.") };
  }
}

export async function deleteFolderAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await deleteMediaFolder(id).catch(() => null);
  revalidatePath("/admin/media");
  // Back to everything: the folder being filtered on no longer exists.
  redirect("/admin/media?folder_deleted=1");
}

export type RenameState = { error?: string; ok?: boolean };

export async function renameMediaAction(_prev: RenameState, formData: FormData): Promise<RenameState> {
  const id = Number(formData.get("id"));
  const filename = String(formData.get("filename") ?? "").trim();
  const alt = String(formData.get("alt_text") ?? "").trim();
  if (!id || !filename) return { error: "Give the file a name." };

  try {
    // Empty clears it. An image with no description is a real state — a
    // decorative one should have alt="" rather than a sentence.
    await updateMedia(id, { filename, alt_text: alt === "" ? null : alt });
    revalidatePath("/admin/media");
    return { ok: true };
  } catch (error) {
    return { error: reason(error, "That rename failed.") };
  }
}

export type ResizeState = { error?: string; ok?: boolean };

export async function resizeMediaAction(_prev: ResizeState, formData: FormData): Promise<ResizeState> {
  const id = Number(formData.get("id"));
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));

  if (!id || !width || !height) return { error: "Give the image a width and a height." };

  const thumbnails = formData.getAll("thumbnails").map(Number).filter(Boolean);

  try {
    await resizeMedia(id, { width, height, thumbnails });
    revalidatePath("/admin/media");
    return { ok: true };
  } catch (error) {
    return { error: reason(error, "That resize failed.") };
  }
}

export type CropState = { error?: string; ok?: boolean };

export async function cropMediaAction(_prev: CropState, formData: FormData): Promise<CropState> {
  const id = Number(formData.get("id"));
  const num = (k: string) => Math.round(Number(formData.get(k)));

  const x = num("x");
  const y = num("y");
  const width = num("width");
  const height = num("height");

  if (!id || !width || !height) return { error: "Draw a crop area first." };

  try {
    await cropMedia(id, { x, y, width, height });
    revalidatePath("/admin/media");
    return { ok: true };
  } catch (error) {
    return { error: reason(error, "That crop failed.") };
  }
}

/**
 * Return to the view the action was started from.
 *
 * Deleting the fourth file in a folder should leave you in that folder, not
 * back at the top of everything with the filters cleared.
 */
function back(formData: FormData, flag: string): string {
  const search = String(formData.get("return_to") ?? "");
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const [key, value] = flag.split("=");
  params.set(key, value);
  return `/admin/media?${params.toString()}`;
}
