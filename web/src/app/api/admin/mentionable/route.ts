import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";

/**
 * The mention picker's list (C2, docs/notifications.md): people who can open
 * the screen a note is on. Never cached; `{data: []}` on any failure, so the
 * picker shows nothing rather than an error inside somebody's typing.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = (params.get("scope") ?? "").slice(0, 40);
  const q = (params.get("q") ?? "").slice(0, 60);
  const token = await getToken();
  if (!token || !scope) return NextResponse.json({ data: [] });

  try {
    const res = await apiFetch<{ data: { id: number; name: string }[] }>(
      `/admin/mentionable?scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(q)}`,
      { token },
    );
    return NextResponse.json({ data: res.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
