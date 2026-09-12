import type { MediaItem } from "@/types/api";
import { refusalMessage, uploadWithProgress } from "@/lib/upload-client";

/**
 * One file into the media library, with a percentage.
 *
 * The client half of `/api/admin/media/upload`. Every console upload — the
 * library's own drop zone, the picker inside every image field, the gallery
 * repeater — goes through here rather than through a Server Action, because
 * only a request the browser sends itself can report how far it has got.
 *
 * Resolves with the media row the API created. Rejects with an `Error`
 * whose message is written to be shown: the API's own sentence for a 422
 * ("The file may not be greater than 5120 kilobytes"), a reload prompt for
 * an expired session, and a plain "try again" for the network.
 */
export async function uploadMediaFile(
  file: File,
  { folderId, onProgress, signal }: {
    folderId?: string | null;
    /** Called with 0–100 as the bytes go out. */
    onProgress?: (percent: number, loaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<MediaItem> {
  const form = new FormData();
  form.append("file", file);
  // Uploads land where you are looking. "unfiled" is a view rather than a
  // folder, so it carries no id.
  if (folderId && folderId !== "unfiled") form.append("folder_id", folderId);

  const result = await uploadWithProgress<{ data?: MediaItem; message?: string; errors?: Record<string, string[]> }>(
    "/api/admin/media/upload",
    form,
    {
      signal,
      onProgress: onProgress
        ? (loaded, total) => onProgress(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0, loaded, total)
        : undefined,
    },
  );

  if (!result.ok || !result.body?.data) {
    if (result.status === 401) throw new Error("Your session has expired. Reload the page and sign in again.");
    if (result.status === 413) throw new Error("That file is too large for the server to accept.");
    throw new Error(refusalMessage(result.body, "That upload failed. Try again."));
  }

  return result.body.data;
}
