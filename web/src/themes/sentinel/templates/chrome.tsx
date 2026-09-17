import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { PageEnter } from "@/components/ui/page-enter";
import { defaultTopBar } from "@/lib/navigation";
import type { ChromeData } from "@/themes/contract";
import type { ThemeOptions } from "@/themes/options";
import { SentinelHeader } from "../header";

/** Sentinel's chrome: the info bar, the dark glass header with its seam, the page, the `glow` footer. */
export function Chrome({
  settings, menu, primary, footerMenu, topBar, bottomBar, announcement, options, children,
}: ChromeData & { options: ThemeOptions; children: ReactNode }) {
  return (
    <>
      {announcement && <AnnouncementBar announcement={announcement} />}
      <SentinelHeader
        menu={primary ? primary.sections : menu}
        settings={settings}
        links={primary?.links}
        topBar={topBar ?? defaultTopBar()}
        menuStyle={options.menu_style}
      />
      <main id="main"><PageEnter>{children}</PageEnter></main>
      <SiteFooter layout="glow" settings={settings} columns={footerMenu ?? undefined} bottomBar={bottomBar ?? undefined} />
    </>
  );
}
