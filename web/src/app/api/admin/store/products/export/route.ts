import { getToken } from "@/lib/admin-auth";

/**
 * The shop's catalogue as a CSV — every product and every variation, in the
 * columns the import reads back.
 *
 * A route handler rather than a link straight at the API, for the reason the
 * stock and sales exports document: the admin token lives in an httpOnly
 * cookie only the Next server can read, so a browser following a link to
 * `api.technoware.in` sends no credentials and gets a 401.
 *
 * The products list links here with a plain `<a download>`. A `next/link`
 * prefetches, so merely opening the list would build the whole catalogue on
 * the server, fetch it and throw it away.
 */
export async function GET() {
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(`${base}/api/v1/admin/store/products/export`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("That export could not be built.", { status: 502 });
  }

  // Streamed, and the API's own filename is kept so the saved file carries
  // the date rather than the route.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=UTF-8",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? `attachment; filename="store-catalogue.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
