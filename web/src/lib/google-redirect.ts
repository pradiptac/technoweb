import "server-only";

import { GOOGLE_CALLBACK_PATH } from "@/lib/google-signin";
import { requestHost } from "@/lib/request-host";
import { siteUrl } from "@/lib/site-url";

/**
 * The callback address to give Google, on the origin the browser is at.
 *
 * Not `siteUrl()`: that is the production domain on every machine (it is
 * what canonicals are built on), so on a development machine Google would
 * send the browser to the live site, where the cookie that binds the attempt
 * does not exist. Not `request.url` either — behind a proxy that is
 * `127.0.0.1:3000`. The host is read the way `proxy.ts` reads it,
 * `x-forwarded-host` first, and both handlers call this, so the address is
 * the same at both ends, which Google and the API each insist on.
 *
 * A caller can send any `Host` it likes and gains nothing by it: the API
 * accepts only this site's own host (or localhost) at exactly this path
 * (`CallbackPath::assert`), and anything else is refused before Google is
 * mentioned.
 */
export function googleRedirectUri(headers: { get(name: string): string | null }): string {
  const host = requestHost(headers);
  if (!host) return `${siteUrl()}${GOOGLE_CALLBACK_PATH}`;

  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";

  return `${protocol}://${host}${GOOGLE_CALLBACK_PATH}`;
}
