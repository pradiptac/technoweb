import { NextRequest } from "next/server";
import { getToken } from "@/lib/admin-auth";

/**
 * The lead CSV, proxied.
 *
 * A route handler rather than a link straight at the API, for the reason the
 * subscriber export documents: the admin token lives in an httpOnly cookie only
 * the Next server can read, so a browser following a link to the API sends no
 * credentials and gets a 401. A Server Action cannot do it either — an action
 * returns a value, not a response a browser will save.
 *
 * Streamed rather than buffered, and the filters are passed straight through so
 * the file matches the rows the screen was showing.
 */
export async function GET(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const params = request.nextUrl.searchParams.toString();
  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(
    `${base}/api/v1/admin/leads/export${params ? `?${params}` : ""}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" }, cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("The export could not be produced.", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": upstream.headers.get("content-disposition")
        ?? 'attachment; filename="leads.csv"',
      "Cache-Control": "no-store",
    },
  });
}
