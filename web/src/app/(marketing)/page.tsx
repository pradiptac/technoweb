import { loadHome } from "@/lib/home-data";
import { buildMetadata } from "@/lib/seo";
import { activeTheme } from "@/themes";

export const metadata = buildMetadata({
  title: "Technology infrastructure that keeps your business connected",
  description:
    "Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure across India — backed by a real engineering support desk.",
  path: "/",
});

/**
 * The homepage.
 *
 * Its data is `loadHome()` and its composition is the active theme's `Home`
 * template — since 2026-09-16, when both moved out of this file so a theme
 * can arrange the same ten results differently. The notes that used to be
 * here (why the homepage reads the CMS rather than a static file, why a
 * fetch failure is fatal at build and graceful at runtime, why nothing on
 * this page reveals on scroll) went with them: `lib/home-data.ts` and
 * `themes/classic/templates/home.tsx`.
 */
export default async function HomePage() {
  const [theme, data] = await Promise.all([activeTheme(), loadHome()]);
  const Home = theme.templates.Home;

  return <Home {...data} options={theme.options} />;
}
