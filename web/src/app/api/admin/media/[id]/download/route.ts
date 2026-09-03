import { getToken } from "@/lib/admin-auth";

/**
 * A media file, proxied to the browser under its human filename.
 *
 * The API's own `download_url` is an absolute URL at the API origin, and the
 * console used to link straight at it. A browser navigation carries no
 * `Authorization: Bearer` header — the Sanctum token is in an httpOnly cookie
 * on *this* origin, which is never sent to the API's — so the request arrived
 * unauthenticated.
 *
 * It did not even fail cleanly. A navigation sends `Accept: text/html`, so
 * Laravel's auth middleware tried to redirect to a `login` route an API-only
 * application does not define, and the person pressing Download got
 * **HTTP 500 "Route [login] not defined."** rather than a file. That is the
 * exact trap `API.md` opens with, and a link is the one caller that cannot set
 * the header itself.
 *
 * So the token is attached here, server-side, the way the invoice, the CV and
 * the four CSV exports already do it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const { id } = await params;
  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(
    `${base}/api/v1/admin/media/${Number(id)}/download`,
    {
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!upstream.ok || !upstream.body) {
    // Terse on purpose: the cases that happen are an expired session and a file
    // that has been purged, and neither wants a stack trace.
    return new Response("That file is not available.", {
      status: upstream.status === 401 ? 401 : 404,
    });
  }

  // Streamed, not buffered — a 30MB video must not become 30MB of Node memory.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      /*
       * `attachment`, whatever the API said.
       *
       * The library holds SVGs, PDFs and HTML-ish text files. Rendered inline
       * these execute in the console's own origin, which is the whole reason
       * `SvgSanitiser` and the `sandbox` CSP in `api/public/.htaccess` exist.
       * Pressing "Download" should never open a document.
       */
      "Content-Disposition":
        upstream.headers.get("content-disposition")?.replace(/^inline/i, "attachment")
        ?? `attachment; filename="media-${Number(id)}"`,
      "Cache-Control": "no-store",
    },
  });
}
