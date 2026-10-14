import { NextResponse } from "next/server";

import { ApiError, apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/same-origin";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Google fonts copied to this server (0.179.0): the console's picker and its
 * installed list. A route handler rather than a Server Action because the
 * browser asks as the user types and presses, and the answer is never cached.
 *
 * `GET ?mode=installed` lists what is installed; any other GET searches the
 * committed catalogue (`q`, `category`, `page`). Writes check `Origin`.
 */
export async function GET(request: Request) {
  const token = await getToken();
  if (!token) return NextResponse.json({ message: "Not signed in." }, { status: 401, headers: NO_STORE });

  const url = new URL(request.url);
  const installed = url.searchParams.get("mode") === "installed";
  const query = new URLSearchParams();

  if (!installed) {
    for (const key of ["q", "category", "page"]) {
      const value = url.searchParams.get(key);
      if (value) query.set(key, value.slice(0, 60));
    }
  }

  try {
    const res = await apiFetch<unknown>(
      `/admin/settings/google-fonts${installed ? "" : "/catalogue"}${query.size ? `?${query}` : ""}`,
      { token },
    );

    return NextResponse.json(res, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ message: "The fonts could not be loaded." }, { status: 502, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Not allowed." }, { status: 403, headers: NO_STORE });

  const token = await getToken();
  if (!token) return NextResponse.json({ message: "Not signed in." }, { status: 401, headers: NO_STORE });

  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";

  try {
    const res = await apiFetch<unknown>("/admin/settings/google-fonts", { method: "POST", body: { slug }, token });

    return NextResponse.json(res, { headers: NO_STORE });
  } catch (error) {
    return refusal(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Not allowed." }, { status: 403, headers: NO_STORE });

  const token = await getToken();
  if (!token) return NextResponse.json({ message: "Not signed in." }, { status: 401, headers: NO_STORE });

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]{1,62}$/.test(slug)) return NextResponse.json({ message: "Not found." }, { status: 404, headers: NO_STORE });

  try {
    await apiFetch<unknown>(`/admin/settings/google-fonts/${slug}`, { method: "DELETE", token });

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return refusal(error);
  }
}

/** The API's own sentence for a 422 — it is the refusal the dialog shows — else a plain failure. */
function refusal(error: unknown) {
  if (error instanceof ApiError && error.status === 422) {
    const message = Object.values(error.errors ?? {})[0]?.[0] ?? error.message;

    return NextResponse.json({ message }, { status: 422, headers: NO_STORE });
  }

  return NextResponse.json({ message: "That did not work. Try again shortly." }, { status: 502, headers: NO_STORE });
}
