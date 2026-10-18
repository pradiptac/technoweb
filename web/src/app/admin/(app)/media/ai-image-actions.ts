"use server";

import { revalidatePath } from "next/cache";
import { discardImage, getImageStatus, keepImage, makeImage } from "@/lib/admin";
import type { ImageShapeKey, ImageStatus, ImageStyleKey, KeepOutcome, MakeOutcome } from "@/types/media-ai";

/** Null when the status cannot be read; the tab then draws nothing. */
export async function imageStatusAction(): Promise<ImageStatus | null> {
  try {
    return await getImageStatus();
  } catch {
    return null;
  }
}

export async function makeImageAction(req: { prompt: string; style: ImageStyleKey; shape: ImageShapeKey }): Promise<MakeOutcome> {
  return makeImage(req);
}

/** Keeping writes a library row; nothing else here saves anything. */
export async function keepImageAction(token: string, altText: string, folderId?: number | null): Promise<KeepOutcome> {
  const result = await keepImage(token, altText, folderId);
  if (result.ok) revalidatePath("/admin/media");

  return result;
}

export async function discardImageAction(token: string): Promise<void> {
  try {
    await discardImage(token);
  } catch {
    // A preview that is already gone is the state wanted.
  }
}
