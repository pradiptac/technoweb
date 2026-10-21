import { NextRequest } from "next/server";
import { getToken } from "@/lib/admin-auth";

/**
 * A breakdown as CSV, proxied: the admin token lives in an httpOnly cookie, so
 * a link straight at the API would send none. The query (dimension, kind and
 * the window) goes straight through so the file matches the panel.
 */
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return new Response("Not signed in.", { status: 401 });

  const params = request.nextUrl.searchParams.toString();
  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
  const upstream = await fetch(`${base}/api/v1/admin/analytics/export${params ? `?${params}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) return new Response("The export could not be produced.", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? 'attachment; filename="analytics.csv"',
      "Cache-Control": "no-store",
    },
  });
}
