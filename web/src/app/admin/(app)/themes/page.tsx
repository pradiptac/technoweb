import { existsSync } from "node:fs";
import { join } from "node:path";
import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getSettings, type SettingsPayload } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { siteThemeId, siteThemeOverridden } from "@/lib/site-theme";
import { MANIFESTS } from "@/themes/manifests";
import { ThemesGallery } from "./themes-gallery";

export const metadata = buildMetadata({ title: "Themes", path: "/admin/themes", seo: noIndex });

/**
 * Site → Themes: which folder under `web/src/themes/` builds the public site.
 *
 * A screen of its own beside Popups and Info bar, not a tab of Settings,
 * for the reason the info bar is: the sidebar row is the one door. The row
 * is the `themes` settings group, fetched with every other setting and
 * saved through `saveSettingsAction`, which PATCHes only the `setting__*`
 * names it finds — so this form saves `site_theme` and touches nothing else.
 *
 * The gallery is a client component and reads `themes/manifests.ts`, which
 * is pure data; what only the server can know is passed down: whether each
 * screenshot exists under `public/` (`npm run theme-shots` writes them,
 * and a card without one draws a placeholder rather than a broken image),
 * and whether `SITE_THEME` in the environment is overriding the setting —
 * in which case activating a theme here changes nothing on the site, and
 * the screen has to say so rather than let an editor conclude it is broken.
 */
export default async function AdminThemesPage() {
  let settings: SettingsPayload;
  try {
    settings = await getSettings();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Administrators only">
          The site&rsquo;s theme is restricted to administrator accounts. Ask one to make
          the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the themes">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const rows = settings.groups.themes ?? [];
  const stored = rows.find((r) => r.key === "site_theme")?.value ?? "";
  const shots = Object.fromEntries(
    MANIFESTS.map((m) => [m.id, existsSync(join(process.cwd(), "public", m.screenshot))]),
  );

  return (
    <>
      <PageHeader
        title="Themes"
        lede={<>
          How the public site is built &mdash; its header, its homepage, the shape of
          its pages. The content is the same whichever you choose; the colours
          and type are Settings &rarr; Colour palette.
        </>}
      />

      <ThemesGallery
        stored={stored}
        active={siteThemeId({ site_theme: stored })}
        overridden={siteThemeOverridden()}
        screenshots={shots}
      />
    </>
  );
}
