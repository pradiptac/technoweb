import { getToken } from "@/lib/admin-auth";

/**
 * A ticket attachment, streamed to a signed-in member of staff.
 *
 * These live on the **private** disk and have no public URL by design — a
 * customer's attachment can be a network diagram, a log or a screenshot with
 * credentials in it. The API streams one only to an authorised token.
 *
 * The console used to render the API's absolute URL as a plain `<a href>`,
 * which carries no token: the request arrived unauthenticated and, because a
 * navigation sends `Accept: text/html`, Laravel answered **500 "Route [login]
 * not defined."** rather than 401. So a Phase 1 feature had never once worked
 * from the interface, and nothing caught it — no attachment exists in the
 * seeded data, so no link is ever rendered for the audit to press, and
 * `TicketAttachment` appears nowhere in the test suite.
 *
 * The staff endpoint deliberately performs no ownership check and *does* serve
 * internal-note attachments; the customer half is a different route with a
 * different rule. See `app/api/portal/ticket-attachments/[id]/route.ts`.
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
    `${base}/api/v1/admin/ticket-attachments/${Number(id)}`,
    {
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

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
       * inline it would execute in the console's own origin, next to the
       * session that can read every ticket in the queue.
       */
      "Content-Disposition":
        upstream.headers.get("content-disposition")?.replace(/^inline/i, "attachment")
        ?? `attachment; filename="attachment-${Number(id)}"`,
      "Cache-Control": "no-store",
    },
  });
}
