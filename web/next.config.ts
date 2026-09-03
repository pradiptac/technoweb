import type { NextConfig } from "next";

/**
 * The origins a *browser* actually loads assets from.
 *
 * `API_BASE_URL` is the URL the Next server fetches over, and it is not
 * necessarily the origin in the storage URLs a response carries — Laravel
 * builds those from its own `APP_URL`. On this machine the two are
 * `127.0.0.1:8000` and `localhost:8000`, which are the same host to a person
 * and two different origins to a CSP, and every image-bearing route reported a
 * blocked `img-src` on the first audited run. That is the finding, not a
 * false positive: the browser-facing asset origin is a separate fact and has
 * to be stated separately.
 *
 * So `ASSET_ORIGIN` is read first and `API_BASE_URL` is the fallback, since in
 * production they are the same host. A **loopback** origin additionally
 * contributes its other spelling, because which of the two a given tool writes
 * is not something either end controls — and no production origin is loopback,
 * so this widens nothing that ships.
 */
const assetOriginList = ((): string[] => {
  const origins = new Set<string>();

  for (const raw of [process.env.ASSET_ORIGIN, process.env.API_BASE_URL]) {
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // A malformed URL in the environment must not take the build down; the
      // fallback below still yields a usable policy.
    }
  }

  if (origins.size === 0) origins.add("http://localhost:8000");

  for (const origin of [...origins]) {
    if (origin.includes("//localhost")) origins.add(origin.replace("//localhost", "//127.0.0.1"));
    if (origin.includes("//127.0.0.1")) origins.add(origin.replace("//127.0.0.1", "//localhost"));
  }

  return [...origins];
})();

/** The same set, as a CSP source list. */
const assetOrigins = assetOriginList.join(" ");

/**
 * The same set again, as `images.remotePatterns`.
 *
 * Built from the origins rather than written out, so the optimiser and
 * `img-src` can never disagree about which host serves an upload — a
 * disagreement that shows up as a blocked image in one place and a 400 from
 * `/_next/image` in the other, neither of which says why.
 */
function assetPatterns() {
  return assetOriginList.flatMap((origin) => {
    try {
      const u = new URL(origin);
      return [{
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: "/storage/**",
      }];
    } catch {
      return [];
    }
  });
}

/**
 * Read inside `headers()`, never at module scope.
 *
 * `next.config.ts` is *imported* before Next assigns `NODE_ENV`, so a
 * `const dev` at the top of this file is `true` even during `next build` —
 * which baked `'unsafe-eval'` and a websocket origin into the production
 * policy, from a production build, silently. `headers()` is called after the
 * assignment, so reading it there is correct.
 *
 * Worth knowing alongside: the result of `headers()` is written into
 * `.next/routes-manifest.json` at build time and served from there. Everything
 * this policy is built from is therefore read in the **build** environment —
 * `ASSET_ORIGIN` included, exactly like `API_BASE_URL`. Setting one only at
 * runtime changes nothing.
 */
const isDev = () => process.env.NODE_ENV !== "production";

/**
 * The full policy — shipped as **Report-Only**, deliberately.
 *
 * `script-src` is the directive that matters and the one this application
 * cannot yet tighten. The App Router streams its RSC payload in inline
 * `<script>` tags whose contents differ per page, so they can be neither
 * hashed nor enumerated; the only way to allow them precisely is a per-request
 * nonce, and a nonce forces every page to render dynamically. This site
 * prerenders its index pages on purpose — the build *fails* rather than bake a
 * stale error page into static HTML — so buying `script-src` at the cost of
 * static rendering would trade a real, measured property for a defence-in-depth
 * one.
 *
 * So it is observed rather than enforced, which is also the only honest way to
 * turn on a policy covering a console with a rich-text editor in it: nothing
 * here has been proven not to break Summernote. `scripts/audit.mjs` fails on any
 * violation this policy reports across all 91 routes, so it is a measured
 * claim rather than a hopeful one — and promoting it to enforced is then a
 * matter of moving one string, with evidence.
 */
const fullCsp = (dev: boolean) => [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // Google Tag Manager and the Meta Pixel, and only when an ID is configured —
  // `Analytics` renders nothing at all until someone accepts the cookie
  // banner, so on a default install neither is ever fetched.
  /*
    Razorpay's checkout script is here because the shop cannot take a payment
    without it, and it is the only third-party script on the site that is not
    behind the cookie banner — a payment is not analytics, and somebody who has
    declined tracking still has to be able to pay.

    It is named exactly. `https://checkout.razorpay.com` and nothing wider: a
    wildcard on a payment provider's domain is an allowance somebody else's
    subdomain can grow into.
  */
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval' " : ""}https://www.googletagmanager.com https://connect.facebook.net https://checkout.razorpay.com`,
  // Tailwind emits no inline style, but the root layout does: both palettes go
  // out in one inline <style> so the scheme is right before first paint.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${assetOrigins} https://www.google-analytics.com https://www.facebook.com`,
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    assetOrigins,
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://www.googletagmanager.com",
    // The checkout script talks to these while a payment is open. Without
    // them the dialog renders and then fails at the moment somebody pays,
    // which is the worst place on the site for a silent block.
    "https://api.razorpay.com https://lumberjack.razorpay.com",
    dev ? "ws: wss:" : "",
  ].filter(Boolean).join(" "),
  /*
    What this site legitimately frames: a slider's YouTube video, a video
    embedded in a CMS body, the contact page's Google Maps embed, and GTM's
    no-script iframe. An injected iframe pointing anywhere else is blocked.

    `www.youtube.com` is here as well as `www.youtube-nocookie.com` because the
    body editor's video button emits the first — a slider stores an id and this
    frontend chooses the nocookie host, while Summernote builds the URL itself.
    Both are YouTube; only one of them is the one this code picks.

    This list, `URI.SafeIframeRegexp` in api/config/purifier.php and the
    editor's own toolbar have to agree, and the sanitiser is the one that
    decides: a host allowed here but refused there is a video that vanishes on
    save, and a host allowed there but missing here is one that saves and then
    renders as an empty box on the live page.
  */
  [
    "frame-src 'self'",
    "https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
    "https://www.google.com https://www.googletagmanager.com",
    // The payment dialog itself is an iframe. Blocked, the button appears to
    // do nothing at all.
    "https://api.razorpay.com https://checkout.razorpay.com",
  ].join(" "),
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

/**
 * The subset enforced today.
 *
 * These four cost nothing and cannot break a legitimate integration, and they
 * are the ones that turn a foothold into an escalation:
 *
 * - `base-uri` stops an injected `<base>` re-pointing every relative script
 *   URL on the page at another origin — the classic way a single injected tag
 *   becomes control of the whole document.
 * - `object-src` removes the plugin surface entirely.
 * - `form-action` stops an injected form posting a visitor's credentials
 *   somewhere else, which is the cheapest phishing escalation there is.
 * - `frame-ancestors` is the modern spelling of the `X-Frame-Options` above,
 *   and the one browsers actually honour on nested contexts.
 *
 * Enforcing a partial policy alongside a fuller Report-Only one is deliberate:
 * a policy that is entirely report-only protects nobody while it is being
 * evaluated, and these four need no evaluation.
 */
const ENFORCED_CSP = [
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  /*
   * Moved here from the Report-Only policy, where it did nothing at all.
   *
   * `upgrade-insecure-requests` has **no effect in a report-only policy** — it
   * is one of the two directives the spec says to ignore there, and Chrome says
   * so out loud on every page load: "The Content Security Policy directive
   * 'upgrade-insecure-requests' is ignored when delivered in a report-only
   * policy." That console line was the only evidence it was inert, and it was
   * being read as ordinary noise.
   *
   * It belongs in the enforced half on the same test as the four above: it
   * costs nothing and cannot break a legitimate integration. Every origin this
   * site talks to is already https, so in production it upgrades a stray
   * http:// reference — a CMS body, a pasted image URL — instead of letting the
   * browser make a cleartext request. In development everything is loopback,
   * which browsers exempt.
   */
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  /*
    Every upload in this product goes through a Server Action, and Next caps a
    Server Action's body at **1MB** by default.
    https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions

    That default is below every limit the API actually enforces, so anything
    larger than a small image failed — with a 500 and *no message on screen*,
    because the action throws before its own body runs and there is nothing to
    catch. Small test images passed, ordinary photographs did not, which is why
    it read as "most of the time it does not upload" rather than as a size
    rule.

    The number is the largest request the API will accept: a ticket reply
    carries up to 5 attachments at `TICKET_ATTACHMENT_MAX_KB` (10MB) each, so
    50MB, plus multipart overhead. Media uploads are smaller — 5MB for an
    image or document, 20MB for video — and the CV on the careers form is 2MB.

    **This has to stay above those.** It is a transport ceiling, not a policy:
    the API is what refuses an oversized file, with a message that says so.
    Setting this below the API's limits does not enforce them, it only breaks
    them silently.
  */
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
  // This app is one workspace inside the repo; pin the root so Turbopack does
  // not walk up and pick a lockfile from a sibling directory.
  turbopack: { root: __dirname },

  poweredByHeader: false,
  reactStrictMode: true,

  // `next dev` treats requests carrying an Origin from a host it does not
  // recognise as cross-origin and answers 403 — including its own JS chunks.
  // It considers localhost canonical, so browsing dev at 127.0.0.1 silently
  // serves pages whose client bundle never loads: no hydration, no
  // client-side JS, and no error beyond a 403 in the console. scripts/audit.mjs
  // defaults to 127.0.0.1, so without this an audit passes against a page
  // that is dead client-side. Dev only; `next start` does no such check.
  allowedDevOrigins: ["127.0.0.1"],

  images: {
    /*
     * Product images, case-study covers and media-library uploads are served by
     * the Laravel API, so the optimiser has to be told which origin they come
     * from — anything else is a 400 from `/_next/image`, with no clue on the
     * page as to why.
     *
     * Almost every `<Image>` here passes `unoptimized` and so never consults
     * this list at all; the handful that do not would have broken on the first
     * production deploy, because the only pattern was localhost. Derived from
     * `ASSET_ORIGIN` (falling back to `API_BASE_URL`) rather than hard-coded,
     * for the reason the CSP derives its `img-src` from the same pair: three
     * hand-written copies of one hostname is three chances to disagree.
     *
     * Read at config load, so like the CSP it belongs in the **build**
     * environment, not just the runtime one.
     */
    formats: ["image/avif", "image/webp"],
    remotePatterns: assetPatterns(),
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: ENFORCED_CSP },
          { key: "Content-Security-Policy-Report-Only", value: fullCsp(isDev()) },
          /*
           * HSTS — production only, and that condition is the whole of the
           * care needed here.
           *
           * A browser that has seen this header refuses plain http to the host
           * for the stated period and will not let anyone click through the
           * warning. Sent from a development server it would pin *localhost*
           * that way, which breaks every other project on the machine that
           * serves http on it, and cannot be undone except through
           * chrome://net-internals. That is why it is inside `headers()` with
           * the rest of the environment-dependent policy rather than a
           * constant: `next.config.ts` is imported before Next assigns
           * `NODE_ENV`, so a module-scope check reads "development" during a
           * production build and would have shipped no header at all.
           *
           * Two years, subdomains included. `preload` is deliberately absent:
           * submitting to the preload list is a decision with no quick way back
           * — it is baked into browser binaries — and it should be taken
           * knowingly once the domain has been serving this header for a while,
           * not switched on by a deploy.
           *
           * Plesk may also add this at the web server. Two identical headers
           * are harmless; two *different* ones are not, so if it is set there,
           * set it there only.
           */
          ...(isDev()
            ? []
            : [{
                key: "Strict-Transport-Security",
                value: "max-age=63072000; includeSubDomains",
              }]),
        ],
      },
    ];
  },
};

export default nextConfig;
