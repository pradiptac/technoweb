import { NextResponse, type NextRequest } from "next/server";

import { ApiError } from "@/lib/api";
import { SESSION_COOKIE, signInWithGoogle } from "@/lib/auth";
import { googleRedirectUri } from "@/lib/google-redirect";
import { GOOGLE_COOKIE, googleCookieOptions, googleNoticeFor } from "@/lib/google-signin";
import { safeReturnPath } from "@/lib/safe-return";
import { WISHLIST_COOKIE } from "@/lib/wishlist-cookie";

/**
 * "Continue with Google", second leg: Google has sent the browser back.
 *
 * The API does the believing — it spends the attempt, asks Google who this
 * is and answers exactly like a sign-in. This handler carries three things
 * to it (Google's `code` and `state`, and the value from the cookie the
 * first leg set) and turns the answer into a session cookie and a redirect.
 *
 * Every way it can go wrong lands on the sign-in form with a `?google=` key
 * the form looks up; nothing Google or the API said is put in a URL. Both
 * redirects are **relative** `Location`s, for the reason the visit link's
 * handler gives: behind a proxy `request.url` names a port nothing public
 * listens on.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const saved = readCookie(request.cookies.get(GOOGLE_COOKIE)?.value);
  if (!saved) return back("expired");

  // "Cancel" on Google's screen comes back as `error=access_denied`.
  const refused = params.get("error");
  if (refused) return back(refused === "access_denied" ? "cancelled" : "failed");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("failed");

  let session;
  try {
    session = await signInWithGoogle({
      code,
      state,
      redirectUri: googleRedirectUri(request.headers),
      binding: saved.binding,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // The portal switched off mid-flight: its own page says so.
      if (error.reason === "portal_disabled") return leave("/portal/login");

      return back(googleNoticeFor(error.reason, error.status));
    }

    return back("failed");
  }

  const response = leave(saved.returnTo);
  response.cookies.set(SESSION_COOKIE.name, session.token, SESSION_COOKIE.options());
  // The guest's wishlist joined the account's inside the sign-in; the cookie
  // that addressed it has nothing left to open.
  if (session.mergedWishlist) response.cookies.delete(WISHLIST_COOKIE);

  return response;
}

/** The value the first leg stored, or null when it is missing or not ours. */
function readCookie(raw: string | undefined): { binding: string; returnTo: string } | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { b?: unknown; r?: unknown };

    return typeof parsed.b === "string" && /^[a-f0-9]{64}$/.test(parsed.b)
      ? { binding: parsed.b, returnTo: safeReturnPath(parsed.r) }
      : null;
  } catch {
    return null;
  }
}

/** A redirect that also retires the binding cookie: an attempt is good for one callback. */
function leave(location: string): NextResponse {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  response.cookies.set(GOOGLE_COOKIE, "", { ...googleCookieOptions(), maxAge: 0 });

  return response;
}

const back = (notice: string) => leave(`/portal/login?google=${notice}`);
