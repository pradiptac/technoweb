"use client";

import Script from "next/script";
import { useConsent } from "@/lib/consent";
import type { SiteSettings } from "@/lib/site-settings";

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

  // Nothing at all unless the answer is yes. The server snapshot is null, so
  // the pre-hydration render emits no tags either — loading first and removing
  // later would already have set the cookies.
  if (gated && choice !== "granted") return null;

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
gtag('config', '${ga}');`}
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
