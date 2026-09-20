import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";

export type PaletteGroup = {
  type: string;
  label: string;
  items: { label: string; sub: string | null; admin_path: string }[];
};

/**
 * The command palette's records: `GET /admin/search` on the API, through
 * the staff session's cookie, so the browser never holds the token.
 *
 * A route handler for the same reasons `/api/search` is one — the browser
 * cannot reach the API as the console, a query must never be cached, and a
 * lookup that fails is a palette that still lists the console's own pages,
 * because those are filtered client-side from what the layout rendered.
 * Answers an empty list to an expired session rather than a 401: the palette
 * is a convenience, and the next real navigation will redirect to sign in.
 */
export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ data: [] });

  const token = await getToken();
  if (!token) return NextResponse.json({ data: [] });

  try {
    const res = await apiFetch<{ data: PaletteGroup[] }>(`/admin/search?q=${encodeURIComponent(term)}`, { token });
    return NextResponse.json({ data: res.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
