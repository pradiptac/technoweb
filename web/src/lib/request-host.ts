/**
 * The host a request arrived at, as the client sees it.
 *
 * Behind a reverse proxy — which is what Plesk is here — `host` is whatever
 * the proxy passed on and may be the internal one, so `x-forwarded-host` is
 * read first; a forwarded header can carry a list, and the first entry is
 * the client's. Getting this backwards is how a canonical-host redirect
 * becomes an infinite loop: the check compares the internal host, never
 * matches, and redirects for ever — and how a same-origin check refuses
 * every legitimate press.
 *
 * One definition, used by `proxy.ts` and by every route handler that
 * compares an `Origin` against the request (2026-09-21: two byte-identical
 * copies, which is two places for exactly this logic to drift). Takes any
 * `Headers`-like, and imports nothing, because the proxy runtime is where
 * it runs first.
 */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get("x-forwarded-host") ?? headers.get("host");
  return raw?.split(",")[0]?.trim().toLowerCase() || null;
}
