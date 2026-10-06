import type { ComponentType, ReactNode } from "react";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import type { MenuPanelStyle } from "@/components/layout/mega-menu";
import { SiteFooter, type FooterLayout } from "@/components/layout/site-footer";
import { PageEnter } from "@/components/ui/page-enter";
import { defaultTopBar } from "@/lib/navigation";
import type { MenuSection, NavLink, TopBarLink } from "@/lib/navigation";
import type { SiteSettings } from "@/lib/site-settings";
import type { ChromeData, ThemeTemplates } from "./contract";
import type { ThemeOptions } from "./options";

/** What every theme header takes: the chrome's own data, already resolved. */
export type ThemeHeaderProps = {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
  links?: NavLink[];
  topBar: TopBarLink[];
  menuStyle?: MenuPanelStyle;
};

/**
 * A theme's chrome from its two decisions: which header, which footer.
 *
 * Eight `templates/chrome.tsx` files were the same twenty lines around a
 * header component and a footer layout (2026-09-18) — the info bar, the
 * header fed the assigned menu or the built-in one, `<main id="main">`
 * with the page-enter wrapper, the footer fed the assigned columns. What a
 * theme decides is here as arguments; `between` is for the one theme that
 * draws something between the header and the page (Terminal's status
 * ticker). Classic's chrome stays its own file: it is the site as it was,
 * and it picks its footer per inheriting theme through `footerLayoutFor`.
 */
export function themeChrome({
  Header, footer, between,
}: {
  Header: ComponentType<ThemeHeaderProps>;
  footer: FooterLayout;
  between?: (settings: SiteSettings) => ReactNode;
}): ThemeTemplates["Chrome"] {
  return function Chrome({
    settings, menu, primary, footerMenu, topBar, bottomBar, announcement, motion, options, children,
  }: ChromeData & { options: ThemeOptions; children: ReactNode }) {
    return (
      <>
        {announcement && <AnnouncementBar announcement={announcement} />}
        <Header
          menu={primary ? primary.sections : menu}
          settings={settings}
          links={primary?.links}
          topBar={topBar ?? defaultTopBar()}
          menuStyle={options.menu_style}
        />
        {between?.(settings)}
        <main id="main"><PageEnter transition={motion.page}>{children}</PageEnter></main>
        <SiteFooter layout={footer} settings={settings} columns={footerMenu ?? undefined} bottomBar={bottomBar ?? undefined} />
      </>
    );
  };
}
