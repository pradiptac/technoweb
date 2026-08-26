import { getToken } from "@/lib/admin-auth";

/**
 * Streams a candidate's CV from the API to the browser.
 *
 * A route handler rather than a link straight at the API, because the Sanctum
 * token lives in an httpOnly cookie that browser JavaScript cannot read and an
 * `<a href>` cannot carry. The file itself has no public URL at either end: it
 * sits on the private disk, the API streams it only to an authorised staff
 * token, and this proxies that stream to a session that has already signed in.
 *
 * Nothing is buffered — the body is piped through, so a 2 MB CV does not become
 * 2 MB of Node memory per download.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const base = process.env.API_BASE_URL ?? "http://localhost:8000";

  const upstream = await fetch(`${base}/api/v1/admin/applications/${Number(id)}/cv`, {
    headers: { Accept: "application/octet-stream", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    // Deliberately terse. The interesting cases are 401 (session expired) and
    // 404 (deleted, or never had a CV), and neither wants a stack trace.
    return new Response("That CV is not available.", { status: upstream.status === 401 ? 401 : 404 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      /*
       * `attachment`, always, whatever the API said.
       *
       * A PDF rendered inline is a document from a stranger executing in the
       * console's own origin. Forcing the download is the difference between
       * reading someone's CV and running it.
       */
      "Content-Disposition":
        upstream.headers.get("content-disposition")?.replace(/^inline/i, "attachment") ??
        "attachment",
      // Never cached: it is somebody's personal data behind a session.
      "Cache-Control": "private, no-store",
    },
  });
}
