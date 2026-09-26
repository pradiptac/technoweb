"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useConsent } from "@/lib/consent";
import type { SiteSettings } from "@/lib/site-settings";

/** Paths whose URL is, or once was, a key. The one list; `next.config.ts`
 *  sends `Referrer-Policy: no-referrer` on the same three. */
const SECRET_PATHS = ["/order/", "/newsletter/unsubscribe/", "/store/notify/cancel/"];

/**
 * The URL GA4 is told, built in the page: origin, path, and only the
 * parameters campaign attribution reads. A string of JavaScript rather than a
 * function, because it runs inside the tag's inline script.
 */
const PAGE_LOCATION = "(function(){var u=new URL(location.href),k=new URLSearchParams();"
  + "u.searchParams.forEach(function(v,n){if(/^(utm_[a-z_]+|gclid|gbraid|wbraid)$/.test(n))k.append(n,v)});"
  + "var q=k.toString();return u.origin+u.pathname+(q?'?'+q:'')})()";

/**
 * Google Analytics, Google Tag Manager and the Meta Pixel, each rendered only
 * when its id is configured in Settings.
 *
 * Three deliberate decisions:
 *
 * **Public site only.** This is mounted in `(marketing)/layout.tsx`, not the
 * root, so nothing is loaded inside the admin console or the customer portal.
 * Tracking staff doing their job pollutes the numbers the client is trying to
 * read, and a tracker on a signed-in support page sends ticket URLs — which
 * contain a customer's reference — to a third party.
 *
 * **`afterInteractive`, not `beforeInteractive`.** Analytics must never be on
 * the critical path; a slow tag manager should cost a moment of measurement,
 * not the page.
 *
 * **GTM and GA4 together is usually a mistake.** If a container is configured,
 * it normally loads GA itself, and setting both here double-counts every
 * pageview. Both are offered because some setups genuinely need it, and the
 * admin hint says so.
 *
 * **Consent gates all of it.** When `cookie_consent_enabled` is on, nothing
 * renders until someone accepts — not the script tags, not the no-script
 * pixels. A banner that shows while the tags load anyway is worse than no
 * banner, because it claims a consent that was never obtained.
 *
 * This is a client component for that reason: the answer lives in
 * localStorage and the server cannot know it.
 *
 * **Not on a page a secret addresses** (2026-09-26). An order page, a
 * newsletter unsubscribe and a back-in-stock cancel are each reached by a
 * link whose token is the key, and both tags report the page's URL. The order
 * page no longer carries its token in the address (`lib/order-access.ts`), the
 * other two carry theirs in the path — so none of the three loads a tag at
 * all, and `page_location` everywhere else is the origin and path plus the
 * campaign parameters GA attributes with, never the whole query string (a
 * search term, a filter, whatever a future link puts there). A tag loaded
 * earlier in the visit stays loaded across a client-side navigation, and the
 * checkout's redirect to its order is one — which is safe only because that
 * address carries nothing secret any more. Unsubscribe and cancel are reached
 * from email, never from a link on the site.
 */
export function Analytics({ settings }: { settings: SiteSettings }) {
  const ga = settings.google_analytics_id?.trim();
  const gtm = settings.google_tag_manager_id?.trim();
  const pixel = settings.meta_pixel_id?.trim();

  // "1" is what a boolean setting stores; anything else counts as off, so a
  // blank or a deleted row leaves the previous behaviour rather than silently
  // switching gating on.
  const gated = settings.cookie_consent_enabled === "1";

  // Subscribed rather than read once, so the tags start the moment someone
  // accepts rather than on the next navigation.
  const choice = useConsent();
  const pathname = usePathname() ?? "";

  // Nothing at all unless the answer is yes. The server snapshot is null, so
  // the pre-hydration render emits no tags either — loading first and removing
  // later would already have set the cookies.
  if (gated && choice !== "granted") return null;
  if (SECRET_PATHS.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <>
      {gtm && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}

      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga}', { page_location: ${PAGE_LOCATION} });`}
          </Script>
        </>
      )}

      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixel}');
fbq('track', 'PageView');`}
        </Script>
      )}

      {/* GTM's no-script fallback. Meta and Google both check for these in
          their setup assistants, and each costs one element. */}
      {gtm && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
            height="0"
            width="0"
            title="Google Tag Manager"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
      )}

      {/* The Pixel's no-script fallback. Kept because Meta's own setup checks
          look for it, and it costs one element. */}
      {pixel && (
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}
    </>
  );
}
