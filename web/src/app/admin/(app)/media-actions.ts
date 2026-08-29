"use server";

import { ApiError } from "@/lib/api";
import { getMediaFolders, getMediaList, uploadMedia } from "@/lib/admin";
import type { MediaFolder, MediaItem } from "@/types/api";

export type UploadState = { error?: string; path?: string; url?: string };

/**
 * Shared by every CMS entity with an image field. Lives here rather than in
 * one entity's actions file because nothing about it is entity-specific — the
 * upload goes to the media library and only the returned path is stored on
 * whatever record referenced it.
 */
export async function uploadCoverAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };

  try {
    const media = await uploadMedia(formData);
    return { path: media.path, url: media.url };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { error: Object.values(error.errors ?? {})[0]?.[0] ?? error.message };
    }
    return { error: "That upload failed. Try again." };
  }
}

export type EditorUpload = { url: string; alt: string } | { error: string };

/**
 * An image chosen, dropped or pasted inside the body editor.
 *
 * Summernote's default is to inline the file as a base64 `data:` URI in the
 * body itself, and that is the wrong shape here twice over. A 400KB photograph
 * becomes ~540KB of base64 inside a MySQL TEXT column, carried by every read
 * of that record, every API response and every prerender of the page — and the
 * picture is invisible to the media library, so it can never be found,
 * renamed, given alt text, resized or deleted. `App\Support\MediaAlt` resolves
 * alt text by **path**, so an inlined image has nothing to resolve against
 * either.
 *
 * Going through POST /admin/media instead means a body carries a URL like
 * every other image on the site, and the file is a first-class row the library
 * can list. It also picks up the SVG sanitiser on the way past, which a
 * `data:` URI written straight into the body would have gone around.
 *
 * Not a `useActionState` action: the editor calls this from a Summernote
 * callback rather than from a form, so it takes the FormData directly.
 */
export async function uploadEditorImageAction(formData: FormData): Promise<EditorUpload> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "That file was empty." };

  try {
    const media = await uploadMedia(formData);
    return { url: media.url, alt: media.alt_text ?? "" };
  } catch (error) {
    if (error instanceof ApiError) {
      /*
        No redirect() on a 401, unlike every other action in the console.

        This one is called by fetch() from the browser rather than by a form
        post, so a redirect would be followed invisibly and the "upload" would
        resolve to the sign-in page's HTML — which the editor would then insert
        into the article. Saying it is the only useful thing to do here.
      */
      if (error.status === 401) return { error: "Your session has expired. Reload the page." };
      if (error.status === 422) {
        return { error: Object.values(error.errors ?? {})[0]?.[0] ?? error.message };
      }
      return { error: error.message || "That upload failed." };
    }
    return { error: "That upload failed." };
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
 * `kind: "image"` because this inserts an `<img>`. The Files half of the
 * library holds PDFs and spreadsheets, which belong in a link rather than an
 * image tag — and a picker offering them would produce a broken image for
 * whoever picked one.
 */
export async function browseMediaAction(
  params: { q?: string; folder?: string; page?: number } = {},
): Promise<MediaBrowse> {
  const [page, folders] = await Promise.all([
    getMediaList({ ...params, kind: "image", per_page: 24 }),
    getMediaFolders(),
  ]);

  return {
    items: page.data,
    folders,
    lastPage: page.meta.last_page,
    total: page.meta.total,
  };
}
