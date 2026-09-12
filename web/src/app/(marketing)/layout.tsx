import type { Metadata } from "next";
import { Analytics } from "@/components/layout/analytics";
import { ChatWidget } from "@/components/chat/chat-widget";
import { SitePopup } from "@/components/layout/site-popup";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getBottomBarNav, getFooterNav, getMegaMenu, getPrimaryNav, getTopBarNav } from "@/lib/navigation";
import { publicApi } from "@/lib/api";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { motionAttrs, motionFor } from "@/lib/motion-choices";
import { PageEnter } from "@/components/ui/page-enter";
import { RouteProgress } from "@/components/ui/route-progress";
import { Splash } from "@/components/layout/splash";
import { Logo } from "@/components/layout/logo";
import { Suspense } from "react";
import { JsonLd, jsonLd } from "@/lib/seo";
import type { Popup } from "@/types/api";

/**
 * The public site's chrome.
 *
 * This used to sit in the root layout, which meant the mega menu and the
 * footer rendered around the admin console and the customer portal as well —
 * two signed-in areas showing a marketing nav they have no use for. Scoping
 * it to this route group is what keeps it off them.
 *
 * The Organization and WebSite structured data belongs here for the same
 * reason: it describes the public site, and the admin is noindex.
 */
/**
 * Search-console and Meta domain verification tags.
 *
 * On this layout rather than the root so they appear on the public site only
 * — there is nothing to verify about the admin console, and pages here do not
 * set `verification` themselves, so the layout value survives the merge.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const google = settings.google_site_verification?.trim();
  const meta = settings.meta_domain_verification?.trim();

  if (!google && !meta) return {};

  return {
    verification: {
      ...(google ? { google } : {}),
      ...(meta ? { other: { "facebook-domain-verification": meta } } : {}),
    },
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than per page: the header is in every public
  // response, and both reads are ISR-cached so this costs a revalidation
  // rather than a round trip.
  /*
    Six reads, all ISR-cached and all in one `Promise.all`, so this costs a
    revalidation rather than a round trip per page — and six sequential reads
    rather than six parallel ones would be the whole latency of the chrome on
    every public page.

    All four menu reads are null unless a menu has been assigned in the
    console, and null means "use the navigation built into the site" — which is
    what makes menus additive rather than a migration. The mega menu is still
    fetched either way: a configured menu supplies its own panels, and the
    built-in header needs the CMS-driven ones.
  */
  const [menu, settings, primary, footerMenu, topBar, bottomBar, popups] = await Promise.all([
    getMegaMenu(), getSiteSettings(), getPrimaryNav(), getFooterNav(),
    getTopBarNav(), getBottomBarNav(),
    /*
      Every popup that is live, for the whole site — the browser picks the one
      for this page, because a layout has no pathname to pick with.

      It degrades to none rather than failing the page, the rule
      `getSiteSettings` states for itself: a popup decorates the chrome and
      must never be able to take a page down.
    */
    publicApi.popups().then((r) => r.data).catch(() => [] as Popup[]),
  ]);

  const motion = motionFor(settings);

  return (
    // `public-site` is what scopes the 12px type floor in globals.css to the
    // marketing site. The console keeps its denser scale: it is a tool used
    // at a desk all day, where a 10.5px status chip is legible and the extra
    // rows it buys are the point. A visitor is anyone, on anything.
    //
    // The `data-motion-*` attributes are the Motion settings, stamped here
    // rather than on <html> so every rule they key is scoped to this area:
    // the console stamps nothing and is untouched by construction.
    <div className="public-site" {...motionAttrs(motion)}>
      {/*
        The first-visit splash, before everything else in the tree so it is
        the first thing painted. Its markup is `display: none` on the server;
        the root layout's blocking script decides whether it shows.
      */}
      {motion.splash && (
        <Splash>
          <Logo
            logoUrl={settings.logo_url}
            logoWidth={settings.logo_width}
            logoHeight={settings.logo_height}
            companyName={settings.company_name}
          />
        </Splash>
      )}
      {/* `useSearchParams` inside, which a prerendered page needs a boundary for. */}
      {motion.loader !== "none" && (
        <Suspense fallback={null}>
          <RouteProgress style={motion.loader as "bar" | "pulse"} />
        </Suspense>
      )}
      <SiteHeader
        menu={primary ? primary.sections : menu}
        settings={settings}
        links={primary?.links}
        topBar={topBar ?? undefined}
      />
      <main id="main"><PageEnter>{children}</PageEnter></main>
      <SiteFooter
        settings={settings}
        columns={footerMenu ?? undefined}
        bottomBar={bottomBar ?? undefined}
      />
      <JsonLd data={[jsonLd.organization(settings), jsonLd.website()]} />
      <Analytics settings={settings} />

      {/*
        The website assistant, on the public site only.
        
        Mounted here rather than in the root layout, for the reason `Analytics`
        is: the console and the portal have no use for it, and a chat panel
        pinned over a signed-in support queue is chrome in the way of work.

        `settingEnabled`, never a truthiness check — settings are strings and
        `"0"` is truthy in JavaScript, so `if (settings.chatbot_enabled)` is
        true for a switch that is off.
      */}
      {settingEnabled(settings, "chatbot_enabled", false) && (
        <ChatWidget
          enabled
          /*
            `settingEnabled`, never a truthiness check — settings cross the wire
            as strings and `"0"` is truthy in JavaScript, so a plain `if` is
            true for a switch that is off. That trap has already shipped once in
            this file.
          */
          autoOpen={settingEnabled(settings, "chatbot_auto_open", false)}
          autoOpenDelay={Number(settings.chatbot_auto_open_delay) || 20}
        />
      )}
      {/*
        A popup, when one targets this page.

        No settings gate: a popup is a *record*, so an install with none
        publishes nothing and this renders null — the switch is the record's own
        status and its window, not a site-wide toggle somebody also has to find.

        Every live one is handed over and the browser picks; the component is
        what knows the pathname. See `site-popup.tsx` for why the match cannot
        happen up here.
      */}
      {popups.length > 0 && <SitePopup popups={popups} />}

      {/* Only asked when there is something to ask about: with no analytics
          ID configured, no cookie is ever set and a banner would be theatre. */}
      {settings.cookie_consent_enabled === "1"
        && (settings.google_analytics_id || settings.google_tag_manager_id || settings.meta_pixel_id)
        && <CookieConsent settings={settings} />}
    </div>
  );
}
