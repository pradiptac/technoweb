import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

/**
 * The visitor's address, for the API's rate limits.
 *
 * Every request the API receives from the public site comes from this server,
 * so without being told otherwise Laravel saw one address for every visitor —
 * every per-IP limit was one bucket for the whole site, and five wrong
 * passwords locked an account for everybody. So each uncached call to the API
 * carries `X-Forwarded-For: <visitor>`, and the API believes that header from
 * `TRUSTED_PROXIES` only (api/config/trustedproxy.php).
 *
 * **Which address, and why never the whole header.** A visitor can send any
 * `X-Forwarded-For` they like; what they cannot do is stop the web server in
 * front of Node (Plesk's nginx/Apache) *appending* the address it saw them
 * connect from. So the answer is read from the right: the last entry that is
 * not loopback — loopback being this machine's own proxies handing the request
 * along. With no proxy in front (`next dev`, `next start` on a laptop), Next
 * sets the header itself to the socket's address, so the last entry is still
 * the connecting one. Forwarding the header as received would let anybody pick
 * their own bucket, which is what `proxy-upload.ts` used to do.
 *
 * `CLIENT_IP_HEADER=x-real-ip` reads that header instead, for an edge that
 * *sets* it (nginx `proxy_set_header X-Real-IP $remote_addr`). Only then: a
 * header the edge does not overwrite is one the visitor writes.
 *
 * **Behind a CDN that proxies the whole site** (0.124.0, docs/cdn.md) the
 * address that connects to this server is the CDN's, so the rightmost entry
 * is one of a few hundred edge machines and every visitor behind one shares
 * a rate-limit bucket — five wrong passwords from anybody lock everybody
 * out. The CDN names the visitor in a header of its own, which it sets on
 * every request and overwrites if the visitor sent one:
 * `CLIENT_IP_HEADER=cf-connecting-ip` for Cloudflare, `true-client-ip` for
 * Akamai and Cloudflare Enterprise. The same condition holds, more sharply:
 * it is only safe while this server accepts connections from the CDN alone,
 * because anybody who can reach the origin directly writes that header
 * themselves.
 */
const EDGE_HEADERS = ["x-real-ip", "cf-connecting-ip", "true-client-ip"];

export function clientIpFrom(get: (name: string) => string | null): string | null {
  const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase() ?? "";

  if (EDGE_HEADERS.includes(named)) {
    return normalise(get(named));
  }

  const chain = (get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => normalise(entry))
    .filter((entry): entry is string => entry !== null);

  for (let i = chain.length - 1; i >= 0; i--) {
    if (!isLoopback(chain[i])) return chain[i];
  }

  return chain.at(-1) ?? null;
}

/**
 * `{ "X-Forwarded-For": <visitor> }` for a fetch to the API, or nothing.
 *
 * Reads the incoming request's headers, so it may only be called where there
 * is a request: a Server Action, a route handler, a dynamic render. Anywhere
 * else — a prerender, an ISR regeneration, `generateStaticParams` — it adds
 * nothing rather than throwing, since there is no visitor to name; Next's own
 * control-flow errors are rethrown untouched so a static bail-out still
 * behaves as one.
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  try {
    const incoming = await headers();
    const ip = clientIpFrom((name) => incoming.get(name));

    return ip ? { "X-Forwarded-For": ip } : {};
  } catch (error) {
    unstable_rethrow(error);

    return {};
  }
}

function normalise(raw: string | null): string | null {
  if (!raw) return null;

  let value = raw.trim();
  // `[::1]:3000`-style and `1.2.3.4:5678`-style entries some proxies write.
  if (value.startsWith("[")) value = value.slice(1, value.indexOf("]") > 0 ? value.indexOf("]") : undefined);
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.replace(/:\d+$/, "");
  // An IPv4 address as Node reports it on a dual-stack socket.
  if (value.toLowerCase().startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);

  return isIP(value) ? value : null;
}

function isLoopback(ip: string): boolean {
  return ip === "::1" || /^127\./.test(ip);
}
