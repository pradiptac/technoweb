import { NextRequest } from "next/server";
import { getToken } from "@/lib/admin-auth";

/**
 * The manual GST invoice, proxied.
 *
 * A route handler rather than a link straight at the API, for the reason the
 * subscriber export documents: the admin token lives in an httpOnly cookie only
 * the Next server can read, so a browser following a link to
 * `api.technoware.in` sends no credentials and gets a 401. A Server Action
 * cannot do it either — an action returns a value, not a response the browser
 * will save.
 *
 * The invoice is on the **private** disk and is streamed by an authorised route
 * at both ends. It carries a name, an address and a GSTIN; a public URL for one
 * is a document anybody who guesses a filename can read.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const { number } = await params;
  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(
    `${base}/api/v1/admin/store/orders/${encodeURIComponent(number)}/invoice`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    // 404 rather than 502 for a missing one: the ordinary case is an order
    // whose invoice has not been uploaded yet, which is not a server fault.
    return new Response("That invoice could not be found.", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  // Streamed rather than buffered, and the API's own filename is kept so the
  // saved file is named after the order rather than after the route.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? `attachment; filename="invoice-${number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
