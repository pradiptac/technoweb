/**
 * An upload the browser can watch.
 *
 * `fetch` cannot report how much of a request body has been sent; only
 * `XMLHttpRequest.upload.onprogress` can, and it is the sole reason this
 * module exists. Every progress bar in the product that shows a percentage
 * gets its number from here.
 */

export type UploadResult<T> = {
  ok: boolean;
  status: number;
  /** The parsed JSON body, or null when there was none. */
  body: T | null;
};

export type ProgressHandler = (loaded: number, total: number) => void;

/**
 * POST `form` to `url` and resolve with whatever came back — a refusal is a
 * resolved result with `ok: false`, not a rejection, so a 422 can be worded
 * from the API's own message. Only a request that never completes rejects:
 * the network dropping, or an abort.
 *
 * `onProgress` is called with bytes sent and bytes total as the body goes
 * out. It is the request body, so `total` is a little larger than the file —
 * the multipart framing — and `loaded` reaches `total` before the server has
 * answered; the bar should say "processing" rather than "100%" in that gap,
 * which is the caller's call.
 */
export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  { onProgress, signal }: { onProgress?: ProgressHandler; signal?: AbortSignal } = {},
): Promise<UploadResult<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.setRequestHeader("Accept", "application/json");

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }

    xhr.onload = () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: (xhr.response as T) ?? null });
    };
    xhr.onerror = () => reject(new Error("The upload could not reach the server."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    // No Content-Type: the browser sets `multipart/form-data` with its own
    // boundary, exactly as `fetch` would, and setting it by hand breaks the
    // request.
    xhr.send(form);
  });
}

/** The first sentence the API gives for a refusal, or the fallback. */
export function refusalMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { message?: string; errors?: Record<string, string[]> };
    const first = b.errors ? Object.values(b.errors)[0]?.[0] : undefined;
    return first ?? b.message ?? fallback;
  }
  return fallback;
}
