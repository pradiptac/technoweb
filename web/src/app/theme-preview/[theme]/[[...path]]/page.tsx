import { notFound, redirect } from "next/navigation";
import { Card, CardHead, SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentStaff } from "@/lib/admin-auth";
import { loadChrome } from "@/lib/chrome";
import { loadHome } from "@/lib/home-data";
import { motionAttrs } from "@/lib/motion-choices";
import { noIndex } from "@/lib/no-index";
import { buildMetadata } from "@/lib/seo";
import { activeTheme, forcePreviewTheme } from "@/themes";
import { manifestById } from "@/themes/manifests";

export const metadata = buildMetadata({ title: "Theme preview", path: "/theme-preview", seo: noIndex });

/**
 * A theme, drawn for a signed-in administrator before it is chosen.
 *
 * `/theme-preview/<id>` is that theme's homepage; `/theme-preview/<id>/specimen`
 * is a made-up inner page that exercises the other two slots — a `PageHero`
 * with a trail and a section banner, a grid of `Card`s, a `CtaBand` — so
 * the gallery's Preview shows what an inner page will look like too.
 *
 * Outside `(marketing)`, so the real layout is not applied and its chrome
 * is not drawn twice; under the root layout, so the fonts, the tokens and
 * the scheme script are. Dynamic by nature — the first thing it does is
 * read the admin cookie — and that costs the real site nothing, because it
 * is a segment of its own: the marketing layout stays cookie-free and its
 * pages stay cached.
 *
 * `forcePreviewTheme()` is called **before the first `await` after
 * `params`**. It writes a `cache()`-scoped store that `activeTheme()` reads
 * ahead of the settings, so every dispatcher under this page — the hero,
 * the band, the chrome — renders the named theme without a cookie, a
 * header or a query string reaching any cached render. A layout could not
 * host that call: Next renders a layout and its page as separate segments,
 * and the page's dispatchers can run before a layout's override is set.
 *
 * Links inside the preview go to the live site, in the live theme; the
 * strip at the top says so.
 */
export default async function ThemePreviewPage({
  params,
}: {
  params: Promise<{ theme: string; path?: string[] }>;
}) {
  const { theme: id, path = [] } = await params;
  if (!manifestById(id)) notFound();
  forcePreviewTheme(id);

  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/login");

  const view = path.join("/");
  if (view !== "" && view !== "specimen") notFound();

  const [theme, { chrome }] = await Promise.all([activeTheme(), loadChrome()]);
  const Chrome = theme.templates.Chrome;

  return (
    <ToastProvider>
      <div className="public-site" data-theme={theme.manifest.id} {...motionAttrs(chrome.motion)}>
        <div className="bg-warn-soft px-4 py-2 text-center text-12-5 text-warn">
          Previewing the <b>{theme.manifest.name}</b> theme. Links open the live site in its
          current theme.{" "}
          <a href={`/theme-preview/${id}`} className="font-semibold underline">Homepage</a>
          {" · "}
          <a href={`/theme-preview/${id}/specimen`} className="font-semibold underline">Inner page</a>
        </div>
        <Chrome {...chrome} options={theme.options}>
          {view === "" ? <HomeView /> : <Specimen />}
        </Chrome>
      </div>
    </ToastProvider>
  );
}

async function HomeView() {
  const [theme, data] = await Promise.all([activeTheme(), loadHome()]);
  const Home = theme.templates.Home;
  return <Home {...data} options={theme.options} />;
}

/** An inner page with nothing real on it: the hero, a grid, the band. */
function Specimen() {
  return (
    <>
      <PageHero
        kicker="Specimen"
        title="What an inner page looks like"
        lede="A section banner behind the heading, a breadcrumb trail, a grid of cards and the closing band — the parts every first- and second-level page is built from."
        crumbs={[{ name: "Solutions", path: "/solutions" }, { name: "Specimen", path: `/theme-preview` }]}
        section="solutions"
      />
      <section className="section-y">
        <Container>
          <SectionHeader kicker="Cards" title="Six of the grid" lede="The card every public listing renders, with its icon tile and its hover." />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {["network", "server", "shield", "wifi", "cloud", "headset"].map((icon, i) => (
              <Card key={icon}>
                <CardHead iconName={icon}>Card {i + 1}</CardHead>
                <p className="mt-2 text-14 text-muted">
                  Two lines of summary the way a solution or a service is introduced on its index page.
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
