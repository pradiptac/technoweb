import { NextResponse, type NextRequest } from "next/server";

/**
 * Honours redirects recorded by the API.
 *
 * When an editor changes a slug, Laravel writes a 301 into the `redirects`
 * table. This consults that table before Next renders a 404, so an old URL
 * keeps working — and keeps whatever ranking it had.
 *
 * Named `proxy`, not `middleware`: Next 16 deprecated that file convention and
 * warns on every build until it is renamed. The rename is the whole migration —
 * the function body, the `config` export and the matcher are unchanged. Worth
 * knowing that a proxy now defaults to the Node.js runtime rather than the edge
 * one, which for this file means the `fetch` below runs where the rest of the
 * server code does.
 *
 * It only runs on paths that could plausibly be a renamed content URL, and only
 * when nothing else matched, so the extra request never touches the hot path.
 */
/*
 * Every prefix a model writes a redirect at.
 *
 * This list and `urlPrefix()` on the Laravel side are two halves of one rule
 * with the wire between them, and nothing type-checks one against the other —
 * a model that writes 301s at a prefix missing from here writes them into a
 * void, and the symptom is a URL that 404s after somebody fixed a typo on a
 * different screen. `/careers/` was in exactly that state: `JobOpening` uses
 * `Sluggable`, so renaming a vacancy has always written a redirect that this
 * file never looked for.
 *
 * `/brands/` and `/locations/` are here because the landing pages recompute
 * their path from records they do not own — renaming a brand moves every page
 * about it, which is the case most in need of the redirect working.
 *
 * **`Page` is the deliberate exception.** Its `urlPrefix()` is `''`, so CMS
 * pages live at `/{slug}` and covering them means matching nearly every path on
 * the site. Renaming `/privacy` therefore leaves a 301 nothing serves. That is
 * a real gap and it is left open on purpose rather than by omission: closing it
 * costs an API round trip on every unmatched URL, which is a price paid on
 * every 404 a crawler generates, and the fix if it is ever wanted is a
 * catch-all route rather than a wider prefix list here.
 */
const CHECKED_PREFIXES = [
  "/solutions/", "/services/", "/products/", "/industries/",
  "/blog/", "/case-studies/", "/knowledge-base/",
  "/careers/", "/brands/", "/locations/",
];

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
 * The host the *browser* asked for.
 *
 * Behind a reverse proxy — which is what Plesk is here — `host` is whatever the
 * proxy passed on and may be the internal one, so `x-forwarded-host` is read
 * first. Getting this backwards is how a canonical-host redirect becomes an
 * infinite loop: the check compares the internal host, never matches, and
 * redirects for ever.
 */
function requestHost(request: NextRequest): string | null {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  // A forwarded header can carry a list; the first entry is the client's.
  return raw?.split(",")[0]?.trim().toLowerCase() || null;
}

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

export async function proxy(request: NextRequest) {
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
    const host = requestHost(request);

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

  if (!CHECKED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Signals to the route handler that this request already passed through here,
  // preventing a loop if the redirect target is itself missing.
  if (request.headers.get("x-redirect-checked")) return NextResponse.next();

  const base = process.env.API_BASE_URL;
  if (!base) return NextResponse.next();

  try {
    const res = await fetch(
      `${base}/api/v1/redirects/lookup?path=${encodeURIComponent(pathname)}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 300 } },
    );

    if (!res.ok) return NextResponse.next();

    const payload = (await res.json()) as { data: { to: string; status: number } | null };
    if (!payload.data) return NextResponse.next();

    const target = new URL(payload.data.to + search, request.url);
    return NextResponse.redirect(target, payload.data.status === 302 ? 302 : 301);
  } catch {
    // A redirect lookup must never take the site down — fall through to the 404.
    return NextResponse.next();
  }
}

export const config = {
  // Skip static assets, images and API routes entirely.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
