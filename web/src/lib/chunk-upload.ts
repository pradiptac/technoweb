/**
 * Upload a big file in pieces the host will accept, in order, each through a
 * console route handler (`proxyMultipart`).
 *
 * Shared hosting accepts a couple of megabytes per request and a release or a
 * website's ZIP is tens or hundreds, so the file is sliced (`chunkBytes`, from
 * the API) and posted piece by piece with `name`, `index` and `total` beside
 * it; the API appends them to one file. A piece that fails for a reason on
 * the server's side (5xx, or no answer) is tried again twice; one the API
 * refuses (4xx) stops the upload with the API's own words.
 *
 * Used by System → Updates and Site import.
 */
export type ChunkProgress = { done: number; total: number };

export async function uploadInChunks(options: {
  url: string;
  file: File;
  name: string;
  chunkBytes: number;
  onProgress?: (progress: ChunkProgress) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { url, file, name, chunkBytes, onProgress } = options;
  const total = Math.max(1, Math.ceil(file.size / chunkBytes));
  onProgress?.({ done: 0, total });

  for (let i = 0; i < total; i++) {
    const body = new FormData();
    body.set("name", name);
    body.set("index", String(i));
    body.set("total", String(total));
    body.set("chunk", file.slice(i * chunkBytes, (i + 1) * chunkBytes), "chunk");

    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const res = await fetch(url, { method: "POST", body }).catch(() => null);
      ok = !!res && res.ok;
      if (!ok && res) {
        const payload = await res.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
        const message = payload?.errors ? Object.values(payload.errors)[0]?.[0] : payload?.message;
        if (res.status < 500) return { ok: false, error: message || "The upload was refused." };
      }
    }

    if (!ok) return { ok: false, error: "The upload stopped. Check the connection and try again." };
    onProgress?.({ done: i + 1, total });
  }

  return { ok: true };
}
