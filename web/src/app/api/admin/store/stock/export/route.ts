import { NextRequest } from "next/server";
import { getToken } from "@/lib/admin-auth";

/**
 * The stock ledger, as a CSV.
 *
 * A route handler rather than a link straight at the API, for the reason the
 * invoice download, the subscriber export and the sales report all document:
 * the admin token lives in an httpOnly cookie only the Next server can read,
 * so a browser following a link to `api.technoware.in` sends no credentials
 * and gets a 401. A Server Action cannot do it either — an action returns a
 * value, not a response the browser will save.
 *
 * The page must link here with a plain `<a download>`. A `next/link`
 * prefetches, so merely loading the stock screen would build the whole file on
 * the server, fetch it and throw it away.
 */
export async function GET(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  /*
   * Forwarded by name rather than by passing the query string through. These
   * five are the whole of what the endpoint takes, and copying an arbitrary
   * query onto an authenticated upstream request is how a parameter nobody
   * meant to expose reaches it.
   */
  const query = new URLSearchParams();
  for (const key of ["from", "to", "product", "reason", "direction"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }

  const upstream = await fetch(
    `${base}/api/v1/admin/store/stock/export?${query.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    // 422 is the range being too wide, which is the caller's to fix and says so
    // in its own words; anything else is ours.
    return new Response(
      upstream.status === 422
        ? "That range is too wide for one report. Narrow it and try again."
        : "That report could not be built.",
      { status: upstream.status === 422 ? 422 : 502 },
    );
  }

  // Streamed, and the API's own filename is kept so the saved file is named
  // after the range rather than after the route.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=UTF-8",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? `attachment; filename="stock-report.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
