import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/same-origin";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Who else has this edit screen open (C2, docs/notifications.md). The strip
 * beats here every 20 seconds and says goodbye with `sendBeacon`, which posts
 * `text/plain` — so the body is read as text and parsed. A failure answers an
 * error, never an empty list: the strip keeps its last answer rather than
 * claiming nobody else is there.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ data: null }, { status: 403, headers: NO_STORE });

  const token = await getToken();
  if (!token) return NextResponse.json({ data: null }, { status: 401, headers: NO_STORE });

  let body: { type?: unknown; id?: unknown; dirty?: unknown; leave?: unknown } | null = null;
  try {
    body = JSON.parse(await request.text());
  } catch {
    body = null;
  }
  const type = typeof body?.type === "string" ? body.type.slice(0, 40) : "";
  const id = Number(body?.id);
  if (!type || !Number.isInteger(id) || id < 1) return NextResponse.json({ data: null }, { status: 422, headers: NO_STORE });

  try {
    if (body?.leave === true) {
      await apiFetch("/admin/presence/leave", { method: "POST", body: { type, id }, token });
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    }
    const out = await apiFetch<unknown>("/admin/presence", { method: "POST", body: { type, id, dirty: body?.dirty === true }, token });
    return NextResponse.json(out, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ data: null }, { status: 502, headers: NO_STORE });
  }
}
