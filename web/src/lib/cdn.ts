/**
 * Whether this request reached the website through a CDN that proxies the
 * whole site, and which header that CDN names the visitor in (0.124.0,
 * docs/cdn.md).
 *
 * Read from the headers such a CDN adds on the way through, by System →
 * Status, to answer one question: is `CLIENT_IP_HEADER` set to match? Behind
 * a proxying CDN the address that connects to this server is the CDN's, so
 * without it every visitor behind one edge machine shares a rate-limit
 * bucket (`lib/client-ip.ts`) and nothing anywhere says so.
 *
 * A hint, not a security decision: a visitor can send these headers too.
 * All it changes is a line of advice on a screen only an administrator sees.
 */
export type CdnInFront = { name: string; header: string };

export function cdnInFront(get: (name: string) => string | null): CdnInFront | null {
  if (get("cf-ray") || (get("cdn-loop") ?? "").toLowerCase().includes("cloudflare")) {
    return { name: "Cloudflare", header: "cf-connecting-ip" };
  }
  if (get("true-client-ip")) return { name: "a CDN", header: "true-client-ip" };

  return null;
}

/** The header `lib/client-ip.ts` has been told to read, lower-cased, or `""`. */
export function clientIpSetting(env: Record<string, string | undefined> = process.env): string {
  return env.CLIENT_IP_HEADER?.trim().toLowerCase() ?? "";
}
