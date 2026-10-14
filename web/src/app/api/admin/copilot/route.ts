import { NextResponse } from "next/server";

import { ApiError, apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/same-origin";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Ask ALTIS (0.177.0, `docs/copilot.md`): the drawer's two calls.
 *
 * A route handler rather than a Server Action, for the palette's reasons:
 * the browser cannot reach the API as the console, the staff token lives
 * in an httpOnly cookie, and an answer must never be cached — it is a
 * figure about this minute.
 *
 * `POST` checks `Origin`, the rule every cookie-authenticated handler
 * that *does* something follows. It writes nothing, but it can reach a
 * model, and a cross-site page quietly spending somebody's daily cap is
 * what the check costs one line to prevent.
 */
export async function GET() {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ data: [], meta: { ai: false } }, { status: 401, headers: NO_STORE });
  }

  try {
    const res = await apiFetch<{ data: { key: string; label: string }[]; meta: { ai: boolean } }>(
      "/admin/copilot/questions",
      { token },
    );

    return NextResponse.json(res, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ data: [], meta: { ai: false } }, { status: 502, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Not allowed." }, { status: 403, headers: NO_STORE });
  }

  const token = await getToken();

  if (!token) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question : "";

  try {
    const res = await apiFetch<{ data: unknown }>("/admin/copilot/ask", {
      method: "POST",
      body: { question },
      token,
    });

    return NextResponse.json(res, { headers: NO_STORE });
  } catch (error) {
    // The API's own 422 for an empty question is worth passing through;
    // anything else is "it did not answer", which the drawer says.
    const status = error instanceof ApiError && error.status === 422 ? 422 : 502;

    return NextResponse.json({ message: "That could not be answered." }, { status, headers: NO_STORE });
  }
}
