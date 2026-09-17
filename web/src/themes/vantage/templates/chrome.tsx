import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { PageEnter } from "@/components/ui/page-enter";
import { defaultTopBar } from "@/lib/navigation";
import type { ChromeData } from "@/themes/contract";
import type { ThemeOptions } from "@/themes/options";
import { VantageHeader } from "../header";

/** Vantage's chrome: the info bar, the see-through pill over the page, the page, the `contact` footer. */
export function Chrome({
  settings, menu, primary, footerMenu, topBar, bottomBar, announcement, options, children,
}: ChromeData & { options: ThemeOptions; children: ReactNode }) {
  return (
    <>
      {announcement && <AnnouncementBar announcement={announcement} />}
      <VantageHeader
        menu={primary ? primary.sections : menu}
        settings={settings}
        links={primary?.links}
        topBar={topBar ?? defaultTopBar()}
        menuStyle={options.menu_style}
      />
      <main id="main"><PageEnter>{children}</PageEnter></main>
      <SiteFooter layout="contact" settings={settings} columns={footerMenu ?? undefined} bottomBar={bottomBar ?? undefined} />
    </>
  );
}
