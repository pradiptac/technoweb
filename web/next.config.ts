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
const assetOrigins = (() => {
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

  return [...origins].join(" ");
})();

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
 * here has been proven not to break CKEditor. `scripts/audit.mjs` fails on any
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
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval' " : ""}https://www.googletagmanager.com https://connect.facebook.net`,
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
    dev ? "ws: wss:" : "",
  ].filter(Boolean).join(" "),
  // The three things this site legitimately frames: a slider's YouTube video,
  // the contact page's Google Maps embed, and GTM's no-script iframe. An
  // injected iframe pointing anywhere else is blocked outright.
  "frame-src 'self' https://www.youtube-nocookie.com https://www.google.com https://www.googletagmanager.com",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
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
].join("; ");

const nextConfig: NextConfig = {
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
    // Product images, case-study covers and media-library uploads are served
    // by the Laravel API. Add the production API host before launch.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/storage/**" },
    ],
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
        ],
      },
    ];
  },
};

export default nextConfig;
