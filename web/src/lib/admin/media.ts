import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type {
  MediaItem, MediaFolder, Paginated,
} from "@/types/api";

export async function getMediaList(
  params: {
    q?: string; page?: number; per_page?: number; folder?: string; kind?: string;
    sort?: string; direction?: string; trashed?: boolean;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.per_page) query.set("per_page", String(params.per_page));
  // "unfiled" is a real value, not an absent one — see API.md.
  if (params.folder) query.set("folder", params.folder);
  if (params.kind) query.set("kind", params.kind);
  // Both are validated against a whitelist server-side and fall back rather
  // than 422, so passing whatever the URL held is safe.
  if (params.sort) query.set("sort", params.sort);
  if (params.direction) query.set("direction", params.direction);
  // The bin is a view of the same endpoint, not a second one.
  if (params.trashed) query.set("trashed", "1");
  const qs = query.toString();
  return apiFetch<MediaListResponse>(`/admin/media${qs ? `?${qs}` : ""}`, { token: await token() });
}

/**
 * Facts about the whole library, sent with the page of it being shown.
 *
 * The allowed extensions come from the API rather than a second list here —
 * a panel telling an editor what is accepted, built from its own copy, lies
 * the first time somebody widens the real one.
 */
export type MediaLibraryMeta = {
  images: number;
  files: number;
  trashed: number;
  bytes: number;
  extensions: string[];
  max_kb: number;
  max_video_kb: number;
  php_ceiling_kb: number;
  max_megapixels: number;
};

export type MediaListResponse = Paginated<MediaItem> & {
  meta: Paginated<MediaItem>["meta"] & { library?: MediaLibraryMeta };
};

export async function getMediaFolders() {
  const res = await apiFetch<{ data: MediaFolder[] }>("/admin/media-folders", { token: await token() });
  return res.data;
}

export async function createMediaFolder(name: string): Promise<MediaFolder> {
  const res = await apiFetch<{ data: MediaFolder }>("/admin/media-folders", {
    method: "POST", body: { name }, token: await token(),
  });
  return res.data;
}

export async function deleteMediaFolder(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media-folders/${id}`, { method: "DELETE", token: await token() });
}

export async function updateMedia(
  id: number,
  body: {
    filename?: string; alt_text?: string | null; description?: string | null;
    tags?: string[]; folder_id?: number | null;
  },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}`, {
    method: "PATCH", body, token: await token(),
  });
  return res.data;
}

export async function cropMedia(
  id: number,
  body: {
    x: number; y: number; width: number; height: number;
    out_width?: number; out_height?: number;
    /** Write to a duplicate and leave the original alone. */
    as_copy?: boolean;
  },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/crop`, {
    method: "POST", body, token: await token(),
  });
  return res.data;
}

export async function resizeMedia(
  id: number,
  body: { width: number; height: number; thumbnails?: number[]; as_copy?: boolean },
): Promise<{ data: MediaItem; thumbnails: MediaItem[] }> {
  return apiFetch<{ data: MediaItem; thumbnails: MediaItem[] }>(`/admin/media/${id}/resize`, {
    method: "POST", body, token: await token(),
  });
}

/**
 * Bulk operations, all POSTs because each does work rather than describing a
 * resource — and all declared above `media/{id}` in the route table, or
 * `media/move` would bind as a record id and 404.
 */
export async function moveMedia(ids: number[], folderId: number | null): Promise<void> {
  // `folder_id: null` is a real instruction — "take these out of their
  // folder" — so the key is always sent rather than omitted when null.
  await apiFetch<void>("/admin/media/move", {
    method: "POST", body: { ids, folder_id: folderId }, token: await token(),
  });
}

export async function copyMedia(ids: number[], folderId?: number | null): Promise<MediaItem[]> {
  const res = await apiFetch<{ data: MediaItem[] }>("/admin/media/copy", {
    method: "POST",
    body: folderId === undefined ? { ids } : { ids, folder_id: folderId },
    token: await token(),
  });
  return res.data;
}

export async function deleteManyMedia(ids: number[]): Promise<number> {
  const res = await apiFetch<{ data: { deleted: number } }>("/admin/media/delete", {
    method: "POST", body: { ids }, token: await token(),
  });
  return res.data.deleted;
}

/**
 * Rotate, flip or adjust. One endpoint because the three differ only in which
 * `ImageEditor` call runs — see the controller.
 *
 * Returns the row that was written to, which is **not** necessarily the one
 * asked about: with `as_copy` the edit lands on a duplicate, and the caller
 * needs its id to keep editing the thing it can now see.
 */

/** A file's superseded copies, newest first. */
export type MediaVersionRow = {
  id: number;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  operation: string | null;
  created_by: string | null;
  created_at: string;
};

export async function getMediaVersions(id: number): Promise<MediaVersionRow[]> {
  const res = await apiFetch<{ data: MediaVersionRow[] }>(`/admin/media/${id}/versions`, { token: await token() });
  return res.data;
}

export async function restoreMediaVersion(id: number, versionId: number): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/versions/${versionId}/restore`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function restoreMedia(id: number): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/restore`, {
    method: "POST", token: await token(),
  });
  return res.data;
}

export async function purgeMedia(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media/${id}/purge`, { method: "DELETE", token: await token() });
}

export async function emptyMediaTrash(): Promise<number> {
  const res = await apiFetch<{ data: { deleted: number } }>("/admin/media/trash/empty", {
    method: "POST", token: await token(),
  });
  return res.data.deleted;
}

export async function transformMedia(
  id: number,
  body: {
    operation: "rotate" | "flip" | "adjust";
    degrees?: 90 | 180 | 270;
    axis?: "horizontal" | "vertical";
    brightness?: number;
    contrast?: number;
    greyscale?: boolean;
    as_copy?: boolean;
  },
): Promise<MediaItem> {
  const res = await apiFetch<{ data: MediaItem }>(`/admin/media/${id}/transform`, {
    method: "POST", body, token: await token(),
  });
  return res.data;
}

export async function deleteMedia(id: number): Promise<void> {
  await apiFetch<void>(`/admin/media/${id}`, { method: "DELETE", token: await token() });
}

