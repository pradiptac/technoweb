import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteFooter, footerLayoutFor } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TopBarStyleProvider } from "@/components/layout/topbar-style";
import { PageEnter } from "@/components/ui/page-enter";
import { defaultTopBar } from "@/lib/navigation";
import { resolveChrome } from "@/themes/chrome";
import type { ChromeData } from "@/themes/contract";
import type { ThemeOptions } from "@/themes/options";

/**
 * Classic's chrome: the strip, the sticky header with the mega menu, the
 * page, the footer. Moved from `(marketing)/layout.tsx` on 2026-09-16 with
 * its notes; the layout keeps everything that is site behaviour rather than
 * design — the splash, the route loader, the structured data, analytics,
 * the assistant, the popup and the consent banner — around this.
 */
export function Chrome({
  settings, menu, primary, footerMenu, topBar, bottomBar, announcement, motion, options, themeId, children,
}: ChromeData & { options: ThemeOptions; themeId: string; children: ReactNode }) {
  const chrome = resolveChrome(themeId, options);
  return (
    <>
      {/* The strip above the header, when Settings say there is one. In flow,
          above the sticky header, so it scrolls away; only this layout has
          it — never the console or the portal. */}
      {announcement && <AnnouncementBar announcement={announcement} />}
      <TopBarStyleProvider value={options.topbar_style}>
        <SiteHeader
          menu={primary ? primary.sections : menu}
          settings={settings}
          links={primary?.links}
          topBar={topBar ?? defaultTopBar()}
          menuStyle={options.menu_style}
          chrome={chrome.header}
        />
      </TopBarStyleProvider>
      <main id="main"><PageEnter transition={motion.page}>{children}</PageEnter></main>
      {/* The footer is the one part of this chrome that changes per theme:
          Enterprise, Horizon and Canvas inherit the header and pick their
          own footer through `footerLayoutFor`. */}
      <SiteFooter
        settings={settings}
        columns={footerMenu ?? undefined}
        bottomBar={bottomBar ?? undefined}
        layout={footerLayoutFor(themeId)}
        chrome={chrome.footer}
      />
    </>
  );
}
