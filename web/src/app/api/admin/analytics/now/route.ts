import { getToken } from "@/lib/admin-auth";

/**
 * The Now tile's poll, proxied: the admin token is in an httpOnly cookie only
 * this server can read. Always no-store, and a failure is a 502 the tile turns
 * into "no number" rather than a zero.
 */
export async function GET() {
  const token = await getToken();
  if (!token) return new Response("Not signed in.", { status: 401 });

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
  const upstream = await fetch(`${base}/api/v1/admin/analytics/now`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("Unavailable.", { status: 502 });

  return new Response(upstream.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
