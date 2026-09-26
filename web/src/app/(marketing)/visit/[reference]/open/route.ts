import { NextResponse, type NextRequest } from "next/server";
import { visitCookieName, visitCookiePath } from "@/lib/visits";

/**
 * The link in a visit email: `/visit/{reference}/open?token=…`.
 *
 * It swaps the token for an httpOnly cookie scoped to `/visit/{reference}`
 * and answers 303 to the clean page, so the secret never stays in an address
 * bar, a history entry, a shared screenshot or an analytics hit — the
 * reason the plan asks for this rather than a `?token=` page like the
 * order's. Nothing is checked here: the page asks the API, and a wrong token
 * is the same 404 there as a wrong reference.
 *
 * The redirect is a **relative** `Location`. Behind Plesk the request arrives
 * at `127.0.0.1:3000`, and a URL built from `request.url` would send the
 * visitor to a port nothing public listens on (CLAUDE.md, "Set hostname and
 * port separately").
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const clean = visitCookiePath(reference);

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: clean, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

  if (/^[a-f0-9]{64}$/.test(token)) {
    response.cookies.set(visitCookieName(reference), token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: clean, maxAge: 60 * 60 * 24 * 90,
    });
  }

  return response;
}
