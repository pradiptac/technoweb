import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { pickedFile } from "@/lib/media-pick";
import type { MediaItem } from "@/types/api";
import type { ImageShapeKey, ImageStatus, ImageStyleKey, KeepOutcome, MadeImage, MakeOutcome } from "@/types/media-ai";
import { token } from "./_shared";

const GENERIC = "Picture help is not available right now.";

/** A refusal (403, 404, 422) is the API's own sentence, returned rather than thrown. */
function sentence(error: unknown): string {
  if (error instanceof ApiError && [403, 404, 422].includes(error.status)) {
    return error.errors?.image?.[0] ?? error.errors?.file?.[0] ?? error.message ?? GENERIC;
  }
  return GENERIC;
}

export async function getImageStatus(): Promise<ImageStatus> {
  return (await apiFetch<{ data: ImageStatus }>("/admin/media/ai-image/status", { token: await token() })).data;
}

export async function makeImage(req: { prompt: string; style: ImageStyleKey; shape: ImageShapeKey }): Promise<MakeOutcome> {
  try {
    const res = await apiFetch<{ data: MadeImage }>("/admin/media/ai-image", { method: "POST", body: req, token: await token() });

    return { ok: true, image: res.data };
  } catch (error) {
    return { ok: false, error: sentence(error) };
  }
}

/** A 422 from the library's own upload rule (`errors.file`) leaves the preview where it is. */
export async function keepImage(imageToken: string, altText: string, folderId?: number | null): Promise<KeepOutcome> {
  try {
    const res = await apiFetch<{ data: MediaItem }>(`/admin/media/ai-image/${imageToken}/keep`, {
      method: "POST", body: { alt_text: altText || undefined, folder_id: folderId ?? undefined }, token: await token(),
    });

    return { ok: true, file: pickedFile(res.data) };
  } catch (error) {
    return { ok: false, error: sentence(error) };
  }
}

export async function discardImage(imageToken: string): Promise<void> {
  await apiFetch(`/admin/media/ai-image/${imageToken}`, { method: "DELETE", token: await token() });
}

/** The administrator's model check; the provider's own words on a refusal. */
export async function testImageModel(): Promise<{ model: string }> {
  return (await apiFetch<{ data: { model: string; ok: boolean } }>("/admin/media/ai-image/test", { method: "POST", token: await token() })).data;
}
