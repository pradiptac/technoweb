"use server";

import { getMediaFolders, getMediaList, importMediaUrl } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import type { MediaFolder, MediaItem } from "@/types/api";

/*
 * There is no upload action here any more. Every console upload — the
 * library, the picker inside each image field, the gallery repeater, the
 * body editor — goes through `lib/media-upload.ts` and the
 * `/api/admin/media/upload` route handler, because a Server Action cannot
 * report how far a request body has got and a progress bar with a real
 * percentage was asked for. The route handler is the same `POST /admin/media`
 * with the same session check; only who sends the bytes changed.
 */

/** What a picker browses: pictures, documents, Lottie animations or 3D models (the last two 0.172.0). */
export type MediaKind = "image" | "file" | "lottie" | "model";

/**
 * "Or paste a link" (0.172.0): the API copies the file into the library and
 * checks it as an upload. The answer is the stored path and URL, or the
 * API's own sentence — never a raw error.
 */
export async function importMediaUrlAction(url: string): Promise<{ path: string; url: string } | { error: string }> {
  const address = url.trim();
  if (!/^https?:\/\//i.test(address)) return { error: "Paste a full address, starting with https://." };
  try {
    const media = await importMediaUrl(address);
    return { path: media.path, url: media.url };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.errors?.url?.[0] ?? error.errors?.file?.[0] ?? error.message };
    return { error: "That link could not be fetched. Try again, or download the file and upload it." };
  }
}

export type MediaBrowse = {
  items: MediaItem[];
  folders: MediaFolder[];
  lastPage: number;
  total: number;
};

/**
 * The library, for the editor's own picker.
 *
 * Uploading is only half of "the media library is where images live" — the
 * other half is inserting one that is already there. Without it the only way
 * to reuse a picture is to upload it a second time, which is how a library
 * ends up holding four copies of the same logo under four hashed names, none
 * of which can be told apart in a grid.
 *
 * Defaults to `kind: "image"` because the commonest caller inserts an `<img>`,
 * and a caller that wants documents — the newsletter's PDF attachment — asks
 * for `"file"`. The Files half of the
 * library holds PDFs and spreadsheets, which belong in a link rather than an
 * image tag — and a picker offering them would produce a broken image for
 * whoever picked one.
 */
export async function browseMediaAction(
  params: { q?: string; folder?: string; page?: number; kind?: MediaKind } = {},
): Promise<MediaBrowse> {
  const [page, folders] = await Promise.all([
    getMediaList({ ...params, kind: params.kind ?? "image", per_page: 24 }),
    getMediaFolders(),
  ]);

  return {
    items: page.data,
    folders,
    lastPage: page.meta.last_page,
    total: page.meta.total,
  };
}
