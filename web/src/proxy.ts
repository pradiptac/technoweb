import { requestHost } from "@/lib/request-host";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * Honours redirects recorded by the API.
 *
 * When an editor changes a slug, Laravel writes a 301 into the `redirects`
 * table. This consults that table before Next renders anything, so an old URL
 * keeps working — and keeps whatever ranking it had.
 *
 * Named `proxy`, not `middleware`: Next 16 deprecated that file convention and
 * warns on every build until it is renamed. A proxy runs in the Node.js
 * runtime, which for this file means two things: the `fetch` below runs where
 * the rest of the server code does, and **module-level state survives between
 * requests** — the file is `require`d once per server process.
 *
 * **The table is held in memory, and that is the whole design.** The first cut
 * called `/redirects/lookup?path=…` on every request under ten content
 * prefixes, with `next: { revalidate: 300 }` on the fetch — and that option
 * does nothing here: Next's own docs say `cache`, `revalidate` and `tags` have
 * no effect in Proxy. So every `/blog/<post>`, `/products/<product>` and
 * `/solutions/<solution>` request — pages that *exist*, served from the
 * route cache in microseconds — first paid a Laravel boot and a MySQL query to
 * be told there was no redirect, and the API's 404 answer was never cacheable
 * anyway. The comment at the top of that file said it "never touches the hot
 * path". It was the hot path.
 *
 * Now the whole active table is fetched once, kept in a `Map`, and refreshed
 * in the background after `TABLE_TTL_MS`. A request costs one `Map.get`. The
 * `/redirects/lookup` call survives for one purpose, on a hit only: it is what
 * records the hit, and a redirect nobody can see being used is one nobody
 * knows they can delete.
 *
 * That also closes a gap the prefix list left open on purpose. CMS pages live
 * at `/{slug}`, so covering a renamed `/privacy` meant checking nearly every
 * path on the site — a price worth refusing while each check was a round
 * trip, and nothing at all now that it is a Map lookup. Every path this
 * matcher reaches is checked.
 */

/** How long a copy of the table is served before a refresh is started. */
const TABLE_TTL_MS = 60_000;

/** How long the first request of a process waits for the table before giving up. */
const TABLE_FETCH_TIMEOUT_MS = 2_000;

type Target = { to: string; status: number };

/*
 * The process's copy of the active redirect table.
 *
 * `fetchedAt` is zero until the first successful load, `refreshing` is the
 * in-flight fetch so two requests arriving together do not both start one.
 * A failed refresh keeps the previous copy: a stale table is a redirect that
 * takes a minute longer to appear, an absent one is every old URL 404ing
 * until the API is back.
 */
const table: { map: Map<string, Target>; fetchedAt: number; refreshing: Promise<void> | null } = {
  map: new Map(),
  fetchedAt: 0,
  refreshing: null,
};

/**
 * The one hostname this site answers on, or nothing.
 *
 * Set it to `www.technoware.in` and every request arriving at
 * `technoware.in` is redirected there. Unset, nothing happens — which is what
 * a development machine at `localhost:3000` needs, and what an install that
 * has not decided yet needs.
 *
 * **An environment variable, not a setting, and that is deliberate.** This
 * runs on every request before anything else, so a database-backed setting
 * would be a round trip on the hot path — and it has to keep working when the
 * API is down, which is precisely when a redirect loop would be unrecoverable.
 * It is a hosting fact, like `API_BASE_URL`.
 *
 * **It has to agree with two other values or the site contradicts itself**:
 * `NEXT_PUBLIC_SITE_URL` here, which is the `metadataBase` every canonical and
 * `og:url` is built on, and `FRONTEND_URL` in the API's `.env`, which builds
 * the canonical on 11 models, the sitemap, campaign links, order links and
 * unsubscribe links — and is the exact string CORS allows. Redirecting to
 * `www` while the canonicals say the bare domain tells a crawler the page it
 * was sent to is not the real one.
 */
const CANONICAL_HOST = process.env.CANONICAL_HOST?.trim().toLowerCase() || null;

/**
 * A machine talking to itself, which is never redirected.
 *
 * `CANONICAL_HOST` is meant to be unset in development — but "meant to" is not
 * a guarantee, and the failure it prevents is an unusually nasty one. With the
 * variable set, a request to `localhost:3000` is answered
 * `301 -> https://www.example.com/`, and **a browser caches a 301
 * permanently**. The development server then appears broken from that browser
 * long after the variable is gone, and clearing it means digging into site
 * settings rather than reloading.
 *
 * That is not hypothetical: it happened here, from a single test run, and cost
 * the developer their local site. So it is a property of the code now rather
 * than of remembering — a loopback host is already canonical by definition,
 * because nobody reaches a development machine by its public name.
 */
function isLoopback(host: string): boolean {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");

  return name === "localhost"
    || name.endsWith(".localhost")
    || name === "127.0.0.1"
    || name === "0.0.0.0"
    || name === "::1";
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;

  /*
   * www / non-www canonicalisation, before anything else.
   *
   * One hostname has to win, or every page exists at two URLs: crawlers split
   * the ranking between them, and anything scoped to an origin — a cookie, a
   * localStorage theme preference, a basket token — is silently two different
   * things depending on which one somebody typed.
   *
   * **The web server is the better place for this if you have access to it.**
   * A Plesk/Apache rule redirects before Node is woken at all and covers static
   * assets this matcher deliberately skips. This exists because that access is
   * not always available, and because a rule that ships with the application
   * cannot be lost in a hosting migration.
   */
  if (CANONICAL_HOST) {
    const host = requestHost(request.headers);

    if (host && !isLoopback(host) && host !== CANONICAL_HOST) {
      const target = new URL(request.url);

      /*
        `hostname` and `port` separately, never `host`.

        Assigning `host` a value with no port in it *leaves the existing port
        alone* — so behind Plesk, where the internal request arrives at
        127.0.0.1:3000, this produced `https://www.technoware.in:3000/…`: a
        redirect to a port nothing public listens on. It looks perfectly
        correct in development, where the port happens to be the one the
        browser wanted. Measured, not reasoned about.

        A port is honoured only when `CANONICAL_HOST` says one out loud.
      */
      const [canonicalName, canonicalPort = ""] = CANONICAL_HOST.split(":");
      target.hostname = canonicalName;
      target.port = canonicalPort;
      /*
        `x-forwarded-proto` where the proxy sets it: behind Plesk the internal
        request is often plain http, so trusting `request.url`'s protocol would
        redirect an https visitor to http and cost them a second hop — through
        an unencrypted one.
      */
      target.protocol = (request.headers.get("x-forwarded-proto") ?? target.protocol).replace(/:?$/, ":");

      /*
        301 for a read and 308 for anything else.

        A crawler needs the permanent 301 to move the ranking. But a 301 is
        historically allowed to turn a POST into a GET, which would drop a form
        submission on the floor — so a non-GET keeps its method with a 308. In
        practice a POST should never arrive here, because the page that carries
        the form was itself redirected before it rendered; this is the case that
        must not silently lose data when it does.
      */
      const read = request.method === "GET" || request.method === "HEAD";

      return NextResponse.redirect(target, read ? 301 : 308);
    }
  }

  /*
   * The console guards its screens by role (`requireScreen()` in
   * `lib/admin-screen.ts`, called by the `(app)` layout and every page), and
   * neither can see its own pathname — so for `/admin` the request goes on
   * carrying it as `x-pathname`. **Always overwritten, never passed through**:
   * the header is the gate's whole input, and one the browser supplied is one
   * the browser chose. Elsewhere nothing reads it, so it is only removed when
   * somebody sent one. `pass()` is every fall-through below; a request that is
   * redirected never needs it.
   *
   * This depends on the proxy running for *every* `/admin` request, prefetches
   * included — hence the second matcher entry below, which has no `missing`
   * rule. Without it a `Purpose: prefetch` request skipped the proxy and
   * reached the layout carrying whatever `x-pathname` it had been given.
   */
  const pass = () => {
    const inConsole = pathname === "/admin" || pathname.startsWith("/admin/");
    if (!inConsole && !request.headers.has("x-pathname")) return NextResponse.next();

    const forwarded = new Headers(request.headers);
    if (inConsole) forwarded.set("x-pathname", pathname);
    else forwarded.delete("x-pathname");

    return NextResponse.next({ request: { headers: forwarded } });
  };

  const base = process.env.API_BASE_URL;
  if (!base) return pass();

  /*
   * Load or refresh the table.
   *
   * A process that has never loaded it waits — bounded by
   * `TABLE_FETCH_TIMEOUT_MS`, and falling through to the ordinary render if
   * the API does not answer in time, so a slow API costs the first request
   * two seconds and never the site. A process holding a copy older than the
   * TTL serves it and refreshes behind the response via `waitUntil`, which
   * keeps the promise alive after the response has gone out.
   */
  if (table.fetchedAt === 0) {
    await loadTable(base).catch(() => {});
  } else if (Date.now() - table.fetchedAt > TABLE_TTL_MS) {
    event.waitUntil(loadTable(base).catch(() => {}));
  }

  let key = pathname;
  let hit = table.map.get(pathname);
  let rest = search;

  // A WordPress site on "Plain" permalinks addressed records by query —
  // `/?p=62`, `/?page_id=5`, `/?product=cap` — and the importer stores those
  // old addresses in exactly that shape. Only ever on the home path, so a
  // real page's own query (`/store?category=…`) is never read as one.
  if (!hit && search !== "" && (pathname === "/" || pathname === "/index.php")) {
    for (const candidate of wordpressKeys(request.nextUrl.searchParams)) {
      const found = table.map.get(candidate.key);

      if (found) {
        [key, hit, rest] = [candidate.key, found, candidate.rest];
        break;
      }
    }
  }

  if (!hit) return pass();

  // The hit is counted by the API, after the response — the one call that
  // still goes to `lookup`, and only ever on a redirect.
  event.waitUntil(
    fetch(`${base}/api/v1/redirects/lookup?path=${encodeURIComponent(key)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TABLE_FETCH_TIMEOUT_MS),
    }).catch(() => {}),
  );

  const target = new URL(hit.to + rest, request.url);
  return NextResponse.redirect(target, hit.status === 302 ? 302 : 301);
}

/**
 * Each query parameter as the key a WordPress "Plain" permalink was stored
 * under (`/?p=62`), with the rest of the query — tracking tags and all — kept
 * for the destination. The value is the decoded one, as the importer stores
 * it (`LinksStep::normalise`).
 */
function wordpressKeys(params: URLSearchParams): { key: string; rest: string }[] {
  const out: { key: string; rest: string }[] = [];

  for (const [name, value] of params) {
    if (value === "" || !/^[a-z0-9_-]+$/i.test(name) || name === "post_type" || name === "preview") continue;

    const others = new URLSearchParams(params);
    others.delete(name);
    others.delete("post_type");
    const rest = others.toString();

    out.push({ key: `/?${name}=${value}`, rest: rest === "" ? "" : `?${rest}` });
  }

  return out;
}

/**
 * Replace the process's copy of the table with the API's current one.
 *
 * Deduplicated on `table.refreshing`, so concurrent callers share one fetch.
 * Throws on failure — callers decide whether that is fatal (it never is) —
 * and leaves the previous copy in place when it does.
 */
async function loadTable(base: string): Promise<void> {
  if (table.refreshing) return table.refreshing;

  table.refreshing = (async () => {
    try {
      const res = await fetch(`${base}/api/v1/redirects`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TABLE_FETCH_TIMEOUT_MS),
      });

      if (!res.ok) throw new Error(`redirect table: ${res.status}`);

      const payload = (await res.json()) as { data: { from: string; to: string; status: number }[] };
      const next = new Map<string, Target>();

      for (const row of payload.data ?? []) {
        next.set(row.from, { to: row.to, status: row.status });
      }

      table.map = next;
      table.fetchedAt = Date.now();
    } finally {
      table.refreshing = null;
    }
  })();

  return table.refreshing;
}

export const config = {
  matcher: [
    {
      // Skip static assets, images and metadata files. `/api` stays in: the
      // canonical-host redirect above has to run there too.
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      /*
       * A `<Link>` prefetch is not a navigation: the URL it fetches is one
       * the page already rendered, so it cannot be a stale slug, and
       * redirecting it would only be repeated on the real click. Next strips
       * `next-router-prefetch` before the proxy sees it in some flows, so the
       * `purpose` header is the one that reliably fires.
       */
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    /*
     * The console, prefetches and all. The entry above skips a prefetch, and
     * for `/admin` that meant the role gate's `x-pathname` arrived as the
     * browser sent it. A redirect-table hit on a console prefetch cannot
     * happen (nothing writes one there), so the only cost is the header.
     */
    { source: "/admin/:path*" },
  ],
};
