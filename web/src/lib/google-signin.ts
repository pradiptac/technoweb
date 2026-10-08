/**
 * "Continue with Google" on the customer portal (docs/auth.md "Signing in
 * with Google"): the names the two route handlers and the two screens share.
 *
 * Directive-less and import-free on purpose — the sign-in page (a server
 * component), the handlers and the console's settings note (a client
 * component) all read it. What needs the request lives in
 * `google-redirect.ts`.
 */

/** Where the button points. A route handler: link to it with a plain `<a>`, never `next/link`. */
export const GOOGLE_START_PATH = "/portal/auth/google";

/** The address registered with Google as the authorised redirect URI. */
export const GOOGLE_CALLBACK_PATH = "/portal/auth/google/callback";

/**
 * The cookie that binds a round trip to the browser that began it.
 *
 * httpOnly, ten minutes, and scoped to the two handlers — nothing else on
 * the site has any use for it. `sameSite: "lax"` is what lets it come back:
 * Google returns the browser with a top-level GET, which lax allows and
 * strict would not.
 */
export const GOOGLE_COOKIE = "tw_google_signin";

export const googleCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: GOOGLE_START_PATH,
  maxAge: 60 * 10,
});

/**
 * What the sign-in screen says when a round trip did not end signed in.
 *
 * `?google=<key>` carries the key and this is the lookup — never a sentence
 * from the URL, which anybody can write (the `?done=` rule).
 */
export const GOOGLE_NOTICES: Record<string, { tone: "info" | "warn" | "err"; title: string; body: string }> = {
  cancelled: {
    tone: "info",
    title: "Google sign-in was cancelled",
    body: "Nothing has changed. Try again, or sign in another way below.",
  },
  expired: {
    tone: "warn",
    title: "That sign-in attempt expired",
    body: "It has to be finished within ten minutes, in the browser it was started in. Press Continue with Google again.",
  },
  failed: {
    tone: "err",
    title: "Google did not confirm that sign-in",
    body: "Try again, or sign in another way below.",
  },
  unverified: {
    tone: "err",
    title: "That Google account cannot be used",
    body: "It has no confirmed email address. Sign in another way below.",
  },
  closed: {
    tone: "info",
    title: "No account uses that Google address",
    body: "New registrations are closed at the moment. Contact us and we will set an account up for you.",
  },
  pending: {
    tone: "info",
    title: "Your account is not live yet",
    body: "It is waiting to be approved. We will email you as soon as it is — nothing more is needed from you.",
  },
  inactive: {
    tone: "err",
    title: "This portal account is not active",
    body: "Contact your account engineer.",
  },
  unconfirmed: {
    tone: "warn",
    title: "Confirm your email address first",
    body: "Your account's address has changed since you linked Google. Use the link we emailed to the new address, or sign in with a code.",
  },
  unavailable: {
    tone: "info",
    title: "Google sign-in is not available",
    body: "Sign in another way below.",
  },
  busy: {
    tone: "warn",
    title: "Too many attempts",
    body: "Wait a minute and try again.",
  },
};

/** The API's `reason` on a refusal, as a notice key. Anything unknown is the plain failure. */
export function googleNoticeFor(reason: string | undefined, status: number): string {
  if (status === 429) return "busy";

  return (
    {
      google_expired: "expired",
      google_unverified: "unverified",
      google_failed: "failed",
      google_login_disabled: "unavailable",
      registration_closed: "closed",
      pending_approval: "pending",
      rejected: "inactive",
      suspended: "inactive",
      email_unverified: "unconfirmed",
    }[reason ?? ""] ?? "failed"
  );
}
