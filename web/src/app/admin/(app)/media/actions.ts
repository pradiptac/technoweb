"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { isThumbnailSize } from "@/types/api";
import {
  copyMedia, createMediaFolder, cropMedia, deleteManyMedia, deleteMedia, deleteMediaFolder,
  emptyMediaTrash, getMediaVersions, moveMedia, purgeMedia, replaceMedia, resizeMedia,
  restoreMedia, restoreMediaVersion, transformMedia, updateMedia, uploadMedia,
} from "@/lib/admin";
import type { MediaVersionRow } from "@/lib/admin";
import type { MediaItem } from "@/types/api";

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
  const description = String(formData.get("description") ?? "").trim();

  /*
    Tags arrive as one comma-separated string, because that is what a single
    text field can carry through a form post.

    Split here rather than server-side so the API keeps taking a real array —
    a string it has to parse is an interface that has to agree with a
    separator nobody wrote down. The API still normalises case, trims and
    de-duplicates: this is a transport concern, that is a data one.
  */
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!id || !filename) return { error: "Give the file a name." };

  try {
    // Empty clears each. An image with no alt text is a real state — a
    // decorative one should have alt="" rather than a sentence.
    await updateMedia(id, {
      filename,
      alt_text: alt === "" ? null : alt,
      description: description === "" ? null : description,
      tags,
    });
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

  // Narrowed to the three the API accepts rather than passed through. A
  // checkbox value is a string from the client, and anything outside the
  // whitelist earns a 422 that says nothing useful to whoever pressed the
  // button.
  const thumbnails = formData.getAll("thumbnails").map(Number).filter(isThumbnailSize);

  // An unchecked checkbox sends nothing at all, so its absence is the "replace
  // the original" answer — which is the default and the safer reading of a
  // form that failed to submit one field.
  const asCopy = formData.get("as_copy") === "1";

  try {
    await resizeMedia(id, { width, height, thumbnails, as_copy: asCopy });
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
    await cropMedia(id, { x, y, width, height, as_copy: formData.get("as_copy") === "1" });
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

/* ------------------------------------------------------------------- bulk */

export type BulkState = { error?: string; ok?: string };

/**
 * The three actions a selection can take.
 *
 * Each returns into the component rather than redirecting, because the
 * selection bar stays mounted either way — unlike the customer approve/reject
 * pair, whose button unmounts on success and takes its own message with it.
 */
function ids(formData: FormData): number[] {
  return formData.getAll("ids").map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

export async function moveMediaAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const selected = ids(formData);
  if (!selected.length) return { error: "Nothing is selected." };

  // "" is the Unfiled option and means null — a real instruction rather than
  // an absent one, exactly as `?folder=unfiled` is on the way in.
  const raw = String(formData.get("folder_id") ?? "");
  const folderId = raw === "" ? null : Number(raw);

  try {
    await moveMedia(selected, folderId);
    revalidatePath("/admin/media");
    return { ok: `Moved ${selected.length} file${selected.length === 1 ? "" : "s"}.` };
  } catch (error) {
    return { error: reason(error, "That move failed.") };
  }
}

export async function copyMediaAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const selected = ids(formData);
  if (!selected.length) return { error: "Nothing is selected." };

  try {
    const copies = await copyMedia(selected);
    revalidatePath("/admin/media");

    // The count is what came back, not what was asked for: a row whose file
    // has gone is skipped rather than failing the batch, and saying "copied 5"
    // when four landed would be the wrong half of that trade.
    return { ok: `Copied ${copies.length} file${copies.length === 1 ? "" : "s"}.` };
  } catch (error) {
    return { error: reason(error, "That copy failed.") };
  }
}

export async function deleteManyMediaAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const selected = ids(formData);
  if (!selected.length) return { error: "Nothing is selected." };

  try {
    const deleted = await deleteManyMedia(selected);
    revalidatePath("/admin/media");
    return { ok: `Deleted ${deleted} file${deleted === 1 ? "" : "s"}.` };
  } catch (error) {
    return { error: reason(error, "That delete failed.") };
  }
}

export type TransformState = { error?: string; item?: MediaItem };

/**
 * One image edit — a quarter turn, a mirror, or a brightness/contrast pass.
 *
 * Not a `useActionState` action: the editor calls it directly and needs the
 * resulting row back, because with "save as a new file" the edit lands on a
 * duplicate and the dialog has to start pointing at that instead.
 */
export async function transformMediaAction(
  id: number,
  body: Parameters<typeof transformMedia>[1],
): Promise<TransformState> {
  try {
    const item = await transformMedia(id, body);
    revalidatePath("/admin/media");
    return { item };
  } catch (error) {
    return { error: reason(error, "That edit could not be applied.") };
  }
}

/* -------------------------------------------------------------------- bin */

export async function restoreMediaAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await restoreMedia(id).catch(() => null);
  revalidatePath("/admin/media");
  redirect(back(formData, "restored=1"));
}

export async function purgeMediaAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await purgeMedia(id).catch(() => null);
  revalidatePath("/admin/media");
  redirect(back(formData, "purged=1"));
}

export async function emptyTrashAction(formData: FormData) {
  await emptyMediaTrash().catch(() => 0);
  revalidatePath("/admin/media");
  redirect(back(formData, "trash_emptied=1"));
}

/* --------------------------------------------------------------- versions */

export type VersionState = { error?: string; item?: MediaItem };

/**
 * Put an archived copy back over the live file.
 *
 * Called directly rather than through `useActionState`, like the transforms:
 * the dialog needs the updated row so it can show the restored image, and the
 * URL it comes back with carries the new `?v=` that makes the change visible.
 */
export async function restoreVersionAction(id: number, versionId: number): Promise<VersionState> {
  try {
    const item = await restoreMediaVersion(id, versionId);
    revalidatePath("/admin/media");
    return { item };
  } catch (error) {
    return { error: reason(error, "That version could not be restored.") };
  }
}

/**
 * A file's history, for the editor dialog.
 *
 * A server action rather than the client calling `getMediaVersions` directly:
 * `lib/admin.ts` opens with `import "server-only"`, so importing it from a
 * client component pulls that into the browser bundle and every page using it
 * fails. Same rule `lib/settings.ts` documents — types may cross, functions
 * that fetch may not.
 */
export async function loadVersionsAction(id: number): Promise<MediaVersionRow[]> {
  try {
    return await getMediaVersions(id);
  } catch {
    // A history that cannot be loaded is not worth failing the dialog for —
    // the editing buttons above it all still work.
    return [];
  }
}

export type ReplaceState = { error?: string; ok?: boolean };

/**
 * Overwrite a file in place.
 *
 * The API refuses a replacement whose extension differs, because the extension
 * is part of the address every record already points at — so the error worth
 * surfacing here is its own sentence, not a generic one.
 */
export async function replaceMediaAction(_prev: ReplaceState, formData: FormData): Promise<ReplaceState> {
  const id = Number(formData.get("id"));
  const file = formData.get("file");

  if (!id) return { error: "That file could not be identified." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a replacement first." };

  const body = new FormData();
  body.set("file", file);

  try {
    await replaceMedia(id, body);
    revalidatePath("/admin/media");
    return { ok: true };
  } catch (error) {
    return { error: reason(error, "That file could not be replaced.") };
  }
}
