import "server-only";
import { announcementFor } from "@/lib/announcement";
import { publicApi } from "@/lib/api";
import { motionFor } from "@/lib/motion-choices";
import { getBottomBarNav, getFooterNav, getMegaMenu, getPrimaryNav, getTopBarNav } from "@/lib/navigation";
import { getSiteSettings } from "@/lib/settings";
import type { Popup } from "@/types/api";
import type { ChromeData } from "@/themes/contract";

/**
 * Everything the public site's chrome is drawn from, in one round.
 *
 * Lifted out of `(marketing)/layout.tsx` on 2026-09-16 so the theme preview
 * route can draw a theme's header and footer from the same data without a
 * second copy of the fetch list — the layout, the preview and, later, the
 * root `not-found.tsx` all read this. The notes are the layout's:
 *
 * Seven reads, all ISR-cached and all in one `Promise.all`, so this costs a
 * revalidation rather than a round trip per page — and seven sequential
 * reads rather than seven parallel ones would be the whole latency of the
 * chrome on every public page.
 *
 * All four menu reads are null unless a menu has been assigned in the
 * console, and null means "use the navigation built into the site" — which
 * is what makes menus additive rather than a migration. The mega menu is
 * still fetched either way: a configured menu supplies its own panels, and
 * the built-in header needs the CMS-driven ones.
 *
 * The popups ride along because the layout mounts them beside the chrome;
 * they are site behaviour rather than design, so they are returned beside
 * `ChromeData` and never handed to a theme. Every live one, for the whole
 * site — the browser picks the one for this page, because a layout has no
 * pathname to pick with. It degrades to none rather than failing the page,
 * the rule `getSiteSettings` states for itself: a popup decorates the
 * chrome and must never be able to take a page down.
 */
export async function loadChrome(): Promise<{ chrome: ChromeData; popups: Popup[] }> {
  const [menu, settings, primary, footerMenu, topBar, bottomBar, popups] = await Promise.all([
    getMegaMenu(), getSiteSettings(), getPrimaryNav(), getFooterNav(),
    getTopBarNav(), getBottomBarNav(),
    publicApi.popups().then((r) => r.data).catch(() => [] as Popup[]),
  ]);

  return {
    chrome: {
      settings, menu, primary, footerMenu, topBar, bottomBar,
      motion: motionFor(settings),
      announcement: announcementFor(settings),
    },
    popups,
  };
}
