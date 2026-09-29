import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";

export type MeetingCustomer = {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  status: string | null;
  status_label: string | null;
};

/**
 * "Schedule a meeting"'s customer lookup: `GET /admin/meetings/customers` on
 * the API, through the staff session's cookie, so the browser never holds the
 * token. Its own endpoint rather than the command palette's, because the
 * palette shows customers only to the support desk and the diary is worked by
 * sales as well (docs/meetings.md, "The console").
 *
 * Never cached — a query is single-use — and an expired session or a refusal
 * answers an empty list: the form still takes the details typed in.
 */
export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ data: [] });

  const token = await getToken();
  if (!token) return NextResponse.json({ data: [] });

  try {
    const res = await apiFetch<{ data: MeetingCustomer[] }>(`/admin/meetings/customers?q=${encodeURIComponent(term)}`, { token });
    return NextResponse.json({ data: res.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
