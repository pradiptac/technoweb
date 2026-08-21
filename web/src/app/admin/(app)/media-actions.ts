"use server";

import { ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/admin";

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
