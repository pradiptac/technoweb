import { cache } from "react";
import { loadHome } from "@/lib/home-data";
import { activeTheme } from "@/themes";

/**
 * The homepage's data, once per request however many theme sections a page
 * places — `loadHome()` is ten fetches, and three sections calling it three
 * times would be thirty round trips the data cache only partly forgives.
 */
const loadHomeOnce = cache(loadHome);

/**
 * One section of the active theme's homepage, drawn on a builder page
 * (0.113.0, the `theme_section` type) — the homepage as a builder page is a
 * stack of these.
 *
 * It renders the theme's own `Home` narrowed to one section through
 * `options.only` (`orderSections()`), so the section is exactly what the
 * homepage draws under the same theme: switching theme redraws it, and no
 * second implementation of any section exists to drift. `sections` and
 * `order` are cleared on the way in: the homepage's background, reveal and
 * on/off switch for that id are the Themes screen's decisions about the
 * homepage, and on a builder page the section's own row — its background,
 * reveal and style, applied by `PageSections` around this — is the one that
 * speaks. A theme that does not draw the id renders nothing.
 *
 * The hero's heading level is not decided here: `PageSections` sets it per
 * request (`lib/hero-heading.tsx`), because whether this page owns its `h1`
 * is a fact about the page, not about the section.
 */
export async function ThemeSectionSlot({ id }: { id: string }) {
  const [theme, data] = await Promise.all([activeTheme(), loadHomeOnce()]);
  const Home = theme.templates.Home;

  return <Home {...data} options={{ ...theme.options, sections: {}, order: [], only: id }} />;
}
