import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";
import icons from "@/content/material-symbols.json";

const NO_STORE = { "Cache-Control": "private, no-store" };
const PER_PAGE = 120;
const NAMES = Object.keys(icons as Record<string, string>);

/**
 * Search the Google icons for the console's pickers (0.179.0, docs/icons.md).
 *
 * The 3,900 names live here, in a route handler, and never in a client
 * bundle; the browser asks for 120 at a time and draws each through the
 * icon file route, which it caches for a year. Staff only — there is nothing
 * secret in an icon name, but nothing outside the console asks.
 *
 * Every word typed must be in the name (`wifi router` finds `wifi_router`),
 * exact matches first, then names that begin with the first word, then the
 * rest alphabetically.
 */
export async function GET(request: Request) {
  if (!(await getToken())) return NextResponse.json({ message: "Not signed in." }, { status: 401, headers: NO_STORE });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().slice(0, 60).replace(/[^a-z0-9_ ]/g, " ").trim();
  const page = Math.max(1, Math.min(200, Number(url.searchParams.get("page")) || 1));
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/_/g, ""));

  const matches = words.length
    ? NAMES.filter((n) => { const flat = n.replace(/_/g, ""); return words.every((w) => flat.includes(w)); })
    : NAMES;

  const first = words[0]?.replace(/_/g, "") ?? "";
  const rank = (n: string) => (n.replace(/_/g, "") === words.join("") ? 0 : n.replace(/_/g, "").startsWith(first) ? 1 : 2);
  const sorted = words.length ? [...matches].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) : matches;

  return NextResponse.json({
    data: sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    meta: { total: sorted.length, page, per: PER_PAGE },
  }, { headers: NO_STORE });
}
