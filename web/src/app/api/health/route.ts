import { APP_VERSION } from "@/lib/version";
import { siteUrl } from "@/lib/site-url";

/**
 * Is this website running, which version is it, and can it reach its API?
 *
 * What the setup wizard and the in-console updater poll after starting or
 * restarting the Node application (`MANUAL/21-updating.md`): the version says
 * the new release is the one answering, `site_url` says it was started with
 * this install's configuration and not a leftover, and `api` says the two
 * halves are connected. Nothing here is secret — a version number and the
 * site's own address — and it reads no request-time data, so it is safe to
 * leave public, like the API's `/up`.
 *
 * `api` is null rather than false when no API address is configured at all,
 * which is a different fault with a different fix.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.API_BASE_URL;
  let api: { reachable: boolean; status: number | null } | null = null;

  if (base) {
    try {
      const res = await fetch(`${base}/up`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
      api = { reachable: res.ok, status: res.status };
    } catch {
      api = { reachable: false, status: null };
    }
  }

  return Response.json(
    { status: "ok", version: APP_VERSION, site_url: siteUrl(), api },
    { headers: { "Cache-Control": "no-store" } },
  );
}
