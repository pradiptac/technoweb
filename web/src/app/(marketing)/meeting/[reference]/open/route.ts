import { NextResponse, type NextRequest } from "next/server";
import { MEETING_COOKIE_AGE, meetingCookieName, meetingCookiePath } from "@/lib/meetings";

/**
 * The link in a meeting email: `/meeting/{reference}/open?token=…`
 * (docs/meetings.md) — the visit's arrangement, copied.
 *
 * It swaps the token for an httpOnly cookie scoped to `/meeting/{reference}`
 * and answers 303 to the clean page, so the secret never stays in an address
 * bar, a history entry, a shared screenshot or an analytics hit. Nothing is
 * checked here: the page asks the API, and a wrong token is the same 404
 * there as a wrong reference. A token that is not 64 hex characters sets no
 * cookie at all.
 *
 * The redirect is a **relative** `Location`: behind Plesk the request
 * arrives at `127.0.0.1:3000`, and a URL built from `request.url` would send
 * the visitor to a port nothing public listens on.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const clean = meetingCookiePath(reference);

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: clean, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

  if (/^[a-f0-9]{64}$/.test(token)) {
    response.cookies.set(meetingCookieName(reference), token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: clean, maxAge: MEETING_COOKIE_AGE,
    });
  }

  return response;
}
