import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getSettings, type SettingsPayload } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { siteThemeId } from "@/lib/site-theme";
import { requireScreen } from "@/lib/admin-screen";
import { ChromeEditor } from "./chrome-editor";

export const metadata = buildMetadata({ title: "Header & footer", path: "/admin/site/chrome", seo: noIndex });

/**
 * Site → Header & footer (0.160.0): which parts of a theme's header and
 * footer show, in what order where the theme allows it, and the words and the
 * link on its buttons.
 *
 * Not a builder. Each theme still draws its own header and footer — the
 * markup, the widths at which a piece appears — and this chooses among the
 * parts that theme has. What it saves is the `header` and `footer` keys of
 * one theme in `site_theme_options`, the row the Themes screen owns; this
 * screen reads the whole row, changes those two keys and posts the whole row
 * back through `saveSettingsAction`, the way the Themes screen does.
 */
export default async function AdminChromePage() {
  await requireScreen();
  let settings: SettingsPayload;
  try {
    settings = await getSettings();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Administrators only">
          The site&rsquo;s header and footer are restricted to administrator accounts.
        </ErrorState>
      );
    }
    return (
      <ErrorState title="We could not load the header and footer">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const rows = settings.groups.themes ?? [];
  const stored = rows.find((r) => r.key === "site_theme")?.value ?? "";
  const optionsRow = rows.find((r) => r.key === "site_theme_options")?.value ?? "";

  return (
    <>
      <PageHeader
        title="Header & footer"
        lede={<>
          Choose which parts of the header and footer show. Each theme draws its own, so
          you pick among the parts it has &mdash; the layout and the widths stay the theme&rsquo;s.
          Colours and type are Site &rarr; Settings &rarr; Colour palette.
        </>}
      />
      <ChromeEditor optionsRow={optionsRow} active={siteThemeId({ site_theme: stored })} />
    </>
  );
}
