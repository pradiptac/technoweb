import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { PageEnter } from "@/components/ui/page-enter";
import { defaultTopBar } from "@/lib/navigation";
import type { ChromeData } from "@/themes/contract";
import { Masthead } from "../masthead";

/**
 * Editorial's chrome: the info bar, the three-rule masthead, the page, the
 * footer. The footer is classic's — a footer is where a theme has the
 * least to say, and this one's columns already read as a paper's back page
 * once the theme's rules and type are on it (theme.css).
 */
export function Chrome({
  settings, menu, primary, footerMenu, topBar, bottomBar, announcement, children,
}: ChromeData & { children: ReactNode }) {
  return (
    <>
      {announcement && <AnnouncementBar announcement={announcement} />}
      <Masthead
        menu={primary ? primary.sections : menu}
        settings={settings}
        links={primary?.links}
        topBar={topBar ?? defaultTopBar()}
      />
      <main id="main"><PageEnter>{children}</PageEnter></main>
      <SiteFooter
        settings={settings}
        columns={footerMenu ?? undefined}
        bottomBar={bottomBar ?? undefined}
      />
    </>
  );
}
