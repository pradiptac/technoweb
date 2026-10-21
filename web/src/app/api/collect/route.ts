import { cookies } from "next/headers";

import { ADMIN_COOKIE } from "@/lib/admin-cookie";
import { apiUrl } from "@/lib/api";
import { clientIpHeaders } from "@/lib/client-ip";

/**
 * The beacon's door (C3, docs/analytics.md): forwards the body, the visitor's
 * address and browser to the API, and answers 204 whatever happens, within
 * two seconds — a beacon has nobody to tell. A staff browser is forwarded
 * with `X-Visitor-Staff: 1` and the API decides by `native_analytics_count_staff`.
 */
export async function POST(request: Request) {
  const body = (await request.text()).slice(0, 2048);
  const gpc = request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1";

  if (!gpc && body) {
    try {
      const staff = (await cookies()).has(ADMIN_COOKIE);
      await fetch(apiUrl("/collect"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(staff ? { "X-Visitor-Staff": "1" } : {}),
          ...(await clientIpHeaders()),
        },
        body,
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      });
    } catch {
      // Nobody to tell.
    }
  }

  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
