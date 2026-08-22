"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { deleteMedia, uploadMedia } from "@/lib/admin";

export type MediaState = { error?: string; uploaded?: string };

export async function uploadMediaAction(_prev: MediaState, formData: FormData): Promise<MediaState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };

  try {
    const media = await uploadMedia(formData);
    revalidatePath("/admin/media");
    return { uploaded: media.filename };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) return { error: Object.values(error.errors ?? {})[0]?.[0] ?? error.message };
    }
    return { error: "That upload failed. Try again." };
  }
}

export async function deleteMediaAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  // Nothing tracks which records reference a file, so this cannot warn about
  // what it will break. The confirmation says so plainly instead.
  await deleteMedia(id).catch(() => null);
  revalidatePath("/admin/media");
  redirect("/admin/media?deleted=1");
}
