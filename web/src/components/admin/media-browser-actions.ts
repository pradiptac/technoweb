"use server";

import { getMediaFolders, getMediaList } from "@/lib/admin";
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
  params: { q?: string; folder?: string; page?: number; kind?: "image" | "file" } = {},
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
