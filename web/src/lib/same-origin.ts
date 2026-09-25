import { requestHost } from "@/lib/request-host";

/**
 * Whether a state-changing request came from a page on this site.
 *
 * The CSRF check every cookie-authenticated route handler makes before it
 * acts. Both session cookies are `sameSite: "lax"`, which keeps them off a
 * cross-site POST in every current browser — this is the second lock, and
 * the one that does not depend on a browser's cookie policy: a browser sends
 * `Origin` on every POST, so one naming another host is refused whatever came
 * with it. An absent header is allowed, because it means a client that is not
 * a browser, and such a client carries a session only if it already has one.
 * `Origin: null` (a sandboxed frame, a privacy redirect) is refused.
 *
 * The host is read the way `proxy.ts` reads it, `x-forwarded-host` first, so
 * Plesk's internal address does not fail every legitimate press. Moved here
 * from the impersonation handler on 2026-09-26, when the multipart handlers
 * (`proxyMultipart`) were found to have no check at all.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  return host !== "" && host === requestHost(request.headers);
}
