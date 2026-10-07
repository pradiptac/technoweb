/**
 * The headers that name this install's asset origin, built at **runtime**.
 *
 * They lived in `next.config.ts`'s `headers()`, which Next evaluates at build
 * time and writes into `.next/routes-manifest.json` — so the policy named
 * whatever `ASSET_ORIGIN` the build machine had, and one build could serve one
 * site. A release is now one build shipped to every install, so the
 * Report-Only policy (the only header carrying an origin) is emitted by
 * `proxy.ts` per document request, from the environment the server was
 * started with. Everything that names no origin — the enforced CSP, nosniff,
 * HSTS and the rest — stays in `next.config.ts`, where it costs nothing.
 *
 * `next.config.ts` imports `assetOriginList` and `isLocalOrigin` from here
 * too, for `images.remotePatterns` on a non-portable build, so the optimiser
 * and `img-src` still cannot disagree about which host serves an upload.
 * Nothing here may import through `@/`: the config file is loaded outside the
 * bundler.
 */

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
 * So `ASSET_ORIGIN` is read and `API_BASE_URL` is the fallback **only when it
 * is unset** — the development case, where the two are one host. They used to
 * be read together, which put an internal `API_BASE_URL` (`http://127.0.0.1:8000`
 * on a Plesk box) into the browser-facing list in production: an `img-src`
 * nobody loads from, and — through `isLocalOrigin` below — the image
 * optimiser's private-address guard switched off on the live site. A
 * **loopback** origin additionally
 * contributes its other spelling, because which of the two a given tool writes
 * is not something either end controls — and no production origin is loopback,
 * so this widens nothing that ships.
 */
export function assetOriginList(env: Record<string, string | undefined> = process.env): string[] {
  const origins = new Set<string>();

  const assetOrigin = env.ASSET_ORIGIN?.trim();

  for (const raw of [assetOrigin || env.API_BASE_URL]) {
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // A malformed URL in the environment must not take the build down; the
      // fallback below still yields a usable policy.
    }
  }

  if (origins.size === 0) origins.add("http://127.0.0.1:8000");

  for (const origin of [...origins]) {
    if (origin.includes("//localhost")) origins.add(origin.replace("//localhost", "//127.0.0.1"));
    if (origin.includes("//127.0.0.1")) origins.add(origin.replace("//127.0.0.1", "//localhost"));
  }

  return [...origins];
}

/**
 * Whether an asset origin is one the image optimiser would refuse by default.
 *
 * Next 16 blocks `/_next/image` from fetching an upstream whose hostname
 * resolves to a private or loopback address — an SSRF guard, and a sound one
 * for a site whose images live on a CDN. Here the upstream is this project's
 * own API, which on every development machine *is* `localhost:8000`, so with
 * the guard on every optimised image answered `400 "url" parameter is not
 * allowed` and the whole site rendered without pictures — and `npm run audit`
 * did not see it, because a failed resource is filtered out of its console
 * check as "not a link checker". Found by a probe that reads console errors
 * unfiltered.
 *
 * The exception is granted only when a configured origin is loopback or
 * RFC 1918, which is the development case; a production `ASSET_ORIGIN` of
 * `https://api.technoware.in` keeps the guard. Read at config load, like the
 * patterns above, so it belongs in the **build** environment.
 */
export function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost"
      || host.endsWith(".localhost")
      || /^127\./.test(host)
      || host === "::1" || host === "[::1]"
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return false;
  }
}

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
function buildReportOnlyCsp(dev: boolean, frameAncestors: string, assetOrigins: string): string {
  return [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `frame-ancestors ${frameAncestors}`,
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
  // Elfsight's platform script is the reviews widget (Settings → Embeds);
  // a snippet pasted into "before </body>" from any other host is reported
  // by the report-only policy and has to be named here when it is promoted.
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval' " : ""}https://www.googletagmanager.com https://connect.facebook.net https://checkout.razorpay.com https://sdk.cashfree.com https://elfsightcdn.com https://static.elfsightcdn.com`,
  // Tailwind emits no inline style, but the root layout does: both palettes go
  // out in one inline <style> so the scheme is right before first paint.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${assetOrigins} https://www.google-analytics.com https://www.facebook.com https://*.elfsightcdn.com https://*.googleusercontent.com`,
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
    // Cashfree's SDK talks to both hosts from the browser; the checkout is a
    // frame on `payments*.cashfree.com`, allowed under frame-src below.
    "https://sdk.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com",
    // The reviews widget fetches its reviews from Elfsight's service.
    "https://core.service.elfsight.com https://*.elfsight.com https://*.elfsightcdn.com",
    // The push bell, and only after it is pressed: Firebase's installation
    // and registration endpoints turn a browser's Web Push subscription into
    // the FCM token the API sends to (`lib/push-client.ts`).
    "https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com",
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
    // Cashfree's modal checkout, sandbox and live.
    "https://sdk.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://sandbox.cashfree.com https://api.cashfree.com",
  ].join(" "),
  // A video from the media library is served from the asset origin, like its
  // pictures: a slide's video, a page-builder `video` section and a store
  // product's uploaded video (2026-09-26).
  `media-src 'self' ${assetOrigins}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ].join("; ");
}

const cache = new Map<string, string>();

/**
 * The Report-Only policy for this process, memoised: the environment does not
 * change while a server runs, and the proxy asks on every document request.
 * `frameAncestors` is `'self'` everywhere except `/embed/*`, which may be
 * framed by anybody (see `next.config.ts`).
 */
export function reportOnlyCsp(frameAncestors = "'self'", mediaCdn: string | null = null): string {
  const dev = process.env.NODE_ENV !== "production";
  // The media CDN (0.124.0) is a setting, not part of the environment: the
  // proxy learns its origin from the API once a minute and names it here, so
  // a video or a vector logo served from it is inside the policy. Checked
  // for the shape of an https origin before it is written into a header.
  const cdn = mediaCdn && /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(mediaCdn) ? mediaCdn : null;
  const key = `${dev}|${frameAncestors}|${cdn ?? ""}`;
  let policy = cache.get(key);

  if (policy === undefined) {
    policy = buildReportOnlyCsp(dev, frameAncestors, [...assetOriginList(), ...(cdn ? [cdn] : [])].join(" "));
    cache.set(key, policy);
  }

  return policy;
}
