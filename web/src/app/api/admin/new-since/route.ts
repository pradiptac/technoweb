import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";

/**
 * The sidebar's poll: `GET /admin/new-since` on the API through the staff
 * session's cookie. Never cached, and `data: null` rather than an error for
 * a session that has gone or a bad moment — the poller tries again in a
 * minute, and the next real navigation is what redirects to sign in.
 */
export async function GET(request: Request) {
  const since = (new URL(request.url).searchParams.get("since") ?? "").trim();
  const token = await getToken();
  if (!since || !token) return NextResponse.json({ data: null });

  try {
    const res = await apiFetch<{ data: unknown }>(`/admin/new-since?since=${encodeURIComponent(since)}`, { token });
    return NextResponse.json({ data: res.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ data: null });
  }
}
