import "server-only";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";

/**
 * Stream a multipart request through to the API, and hand its answer back.
 *
 * The server half of every upload the browser watches. A Server Action gives
 * the browser no progress events, so anything that wants a percentage posts
 * to a route handler instead — and every one of those handlers is this
 * function with a path and a token: the media library, a ticket's
 * attachments, a CV.
 *
 * **Streamed, not buffered.** The body is handed to `fetch` as the stream it
 * arrived as, with its own `Content-Type` — the multipart boundary is in that
 * header and re-serialising the form would change it. Nothing here reads the
 * file: the Next server is a pipe between a browser and an API, and a 50MB
 * upload costs it nothing but the bytes passing through. `duplex: "half"` is
 * what Node's fetch requires before it will stream a request body.
 *
 * The API's answer comes back as it was: its status and its JSON. A 422 with
 * `errors` is the same 422 `apiUpload` would have raised, so a form can word
 * the refusal from the API's own sentences and mark the same fields.
 */
export async function proxyMultipart(
  request: Request,
  apiPath: string,
  { token }: { token?: string | null } = {},
): Promise<NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.startsWith("multipart/form-data") || !request.body) {
    return NextResponse.json({ message: "Send the form as multipart form data." }, { status: 400 });
  }

  const length = request.headers.get("content-length");
  let upstream: Response;

  try {
    upstream = await fetch(apiUrl(apiPath), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": contentType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(length ? { "Content-Length": length } : {}),
        // The API rate-limits public uploads per client, and behind this
        // proxy every one would otherwise arrive from the Next server's own
        // address. Forwarded the way the frontend's other handlers do.
        ...(request.headers.get("x-forwarded-for")
          ? { "X-Forwarded-For": request.headers.get("x-forwarded-for") as string }
          : {}),
      },
      body: request.body,
      // @ts-expect-error -- required by Node's fetch for a streamed request
      // body and not yet in the DOM lib's RequestInit.
      duplex: "half",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "The upload could not reach the server. Try again." }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);

  return NextResponse.json(payload ?? { message: `Upload failed (${upstream.status})` }, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  });
}
