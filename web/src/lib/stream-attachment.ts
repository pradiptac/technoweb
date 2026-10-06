import "server-only";

/**
 * Stream a ticket attachment from the API to whoever holds `token`.
 *
 * Attachments live on the API's **private** disk and have no public URL by
 * design — a customer's attachment can be a network diagram, a log or a
 * screenshot with credentials in it — so the frontend fetches one with the
 * bearer token and streams the bytes on. The two route handlers that call
 * this are deliberately two: the portal's asks the customer endpoint, which
 * checks `customer_id` ownership and refuses anything hanging off an
 * internal note; the console's asks the staff endpoint, which does neither
 * because staff are entitled to both. Proxying one through the other's
 * token would hand every customer the engineers' private notes. What is
 * the same — the fetch, the refusal, the headers — was two copies until
 * 2026-09-18 and is here once.
 *
 * Both used to render the API's absolute URL as a plain `<a href>`, which
 * carries no token: the request arrived unauthenticated and, because a
 * navigation sends `Accept: text/html`, Laravel answered 500 "Route [login]
 * not defined" rather than 401. A Phase 1 feature had never once worked
 * from the interface, and nothing caught it — no attachment exists in the
 * seeded data, so no link is ever rendered for the audit to press.
 *
 * The refusal is 404 for anything that is not an expired session. The API
 * answers 404 rather than 403 for an attachment belonging to somebody else,
 * because a 403 confirms it exists; passing that through unchanged keeps
 * the property.
 */
export async function streamAttachment(token: string | null | undefined, apiPath: string, id: string): Promise<Response> {
  return streamPrivateFile(token, `${apiPath}/${Number(id)}`, `attachment-${Number(id)}`);
}

/**
 * The same stream for a private file that is not addressed by one numeric id
 * — a form submission's upload is `admin/forms/{id}/submissions/{sid}/files/{field}`.
 *
 * `path` is everything after `/api/v1/` and is put into the URL as given, so
 * **the caller checks every segment it took from a request** before calling:
 * a number is passed through `Number()`, a name is held to its own alphabet.
 * Nothing here can do that for it, because nothing here knows the shape.
 */
export async function streamPrivateFile(
  token: string | null | undefined, path: string, fallbackName: string,
): Promise<Response> {
  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
  const upstream = await fetch(`${base}/api/v1/${path}`, {
    headers: { Accept: "application/octet-stream", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("That attachment is not available.", {
      status: upstream.status === 401 ? 401 : 404,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      /*
       * `attachment`, always. This is a file a stranger uploaded; rendered
       * inline it would execute in the site's own origin, next to the
       * session that can read every ticket.
       */
      "Content-Disposition":
        upstream.headers.get("content-disposition")?.replace(/^inline/i, "attachment")
        ?? `attachment; filename="${fallbackName}"`,
      "Cache-Control": "no-store",
    },
  });
}
