import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/same-origin";
import type { StaffNotificationsPage } from "@/types/notifications";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The bell's two calls (C2, docs/notifications.md), through the staff
 * session's cookie. Never cached. A failure answers an error status, never an
 * empty list: the drawer must say it could not load, not "Nothing unread".
 */
export async function GET(request: Request) {
  const token = await getToken();
  if (!token) return NextResponse.json({ data: null }, { status: 401, headers: NO_STORE });

  const filter = new URL(request.url).searchParams.get("filter") === "all" ? "all" : "unread";
  try {
    const page = await apiFetch<StaffNotificationsPage>(`/admin/notifications?filter=${filter}`, { token });
    return NextResponse.json(page, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ data: null }, { status: 502, headers: NO_STORE });
  }
}

/** `{id}` marks one read; `{all: true}` marks every one. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Not allowed." }, { status: 403, headers: NO_STORE });

  const token = await getToken();
  if (!token) return NextResponse.json({ message: "Not signed in." }, { status: 401, headers: NO_STORE });

  const body = (await request.json().catch(() => null)) as { id?: unknown; all?: unknown } | null;
  const id = Number(body?.id);
  if (body?.all !== true && !(Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ message: "Nothing to mark." }, { status: 422, headers: NO_STORE });
  }

  try {
    const path = body?.all === true ? "/admin/notifications/read-all" : `/admin/notifications/${id}/read`;
    const out = await apiFetch<unknown>(path, { method: "POST", token });
    return NextResponse.json(out, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ message: "Could not update." }, { status: 502, headers: NO_STORE });
  }
}
