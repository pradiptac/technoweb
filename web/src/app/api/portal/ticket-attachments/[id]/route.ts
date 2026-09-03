import { getToken } from "@/lib/auth";

/**
 * A ticket attachment, streamed to the customer whose ticket it is.
 *
 * The customer half of the staff route beside it, and deliberately a separate
 * one: the portal endpoint checks `customer_id` ownership and refuses anything
 * hanging off an **internal note**, which is the single worst failure this
 * system could have. The staff endpoint does neither, because staff are
 * entitled to both. Proxying one through the other's token would hand every
 * customer the engineers' private notes.
 *
 * Same reason for existing as the staff route: the portal rendered the API's
 * absolute URL as an `<a href>`, a navigation carries no bearer token, and the
 * customer got a 500 instead of their own file.
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
    `${base}/api/v1/ticket-attachments/${Number(id)}`,
    {
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!upstream.ok || !upstream.body) {
    /*
     * 404 for anything that is not an expired session.
     *
     * The API answers 404 rather than 403 for an attachment belonging to
     * somebody else, because a 403 confirms it exists. Passing that through
     * unchanged keeps the property.
     */
    return new Response("That attachment is not available.", {
      status: upstream.status === 401 ? 401 : 404,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition":
        upstream.headers.get("content-disposition")?.replace(/^inline/i, "attachment")
        ?? `attachment; filename="attachment-${Number(id)}"`,
      "Cache-Control": "no-store",
    },
  });
}
