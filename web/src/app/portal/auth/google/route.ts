import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { googleSignInUrl } from "@/lib/auth";
import { googleRedirectUri } from "@/lib/google-redirect";
import { GOOGLE_COOKIE, googleCookieOptions } from "@/lib/google-signin";
import { safeReturnPath } from "@/lib/safe-return";

/**
 * "Continue with Google", first leg (docs/auth.md "Signing in with Google").
 *
 * Asks the API where to send the browser, and before sending it there puts
 * a random value in an httpOnly cookie. The API keeps that value's hash with
 * the attempt, and the callback has to present the cookie again — so a
 * finished consent can only be spent by the browser that started it. Without
 * that, somebody completes the Google screens with *their* account and hands
 * a victim the callback link, and the victim is signed in as them.
 *
 * Where to land afterwards rides in the same cookie, already narrowed to a
 * same-site path, so it never goes through Google's hands.
 *
 * The callback address is `googleRedirectUri()` — the origin the browser is
 * at, never `request.url`, which behind a proxy is `127.0.0.1:3000`. A link
 * to this handler must be a plain `<a>`: a `next/link` would prefetch it,
 * minting an attempt for every render.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"));
  const binding = randomBytes(32).toString("hex");

  let url: string;
  try {
    url = await googleSignInUrl(googleRedirectUri(request.headers), binding);
  } catch {
    // Switched off since the page was drawn, the portal closed, or the API
    // unreachable: back to the form, which says what is still on offer.
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/portal/login?google=unavailable", "Cache-Control": "no-store" },
    });
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
  response.cookies.set(GOOGLE_COOKIE, JSON.stringify({ b: binding, r: returnTo }), googleCookieOptions());

  return response;
}
