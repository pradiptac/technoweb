import type { Metadata } from "next";
import { loadHome } from "@/lib/home-data";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { activeTheme } from "@/themes";
import { brandName } from "@/lib/brand";
import { ApiError, publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { getSiteSettings } from "@/lib/settings";
import { Container } from "@/components/ui/container";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { RelatedEntities } from "@/components/content/related-entities";
import { PageSections, startsWithHero } from "@/components/page-sections/page-sections";
import type { CmsPage } from "@/types/api";

const HOME_TITLE = "Technology infrastructure that keeps your business connected";
const homeDescription = () =>
  `${brandName()} designs, deploys and supports enterprise networks, servers, storage and security infrastructure across India — backed by a real engineering support desk.`;

/**
 * The builder page chosen as the homepage, or null for the theme's own.
 *
 * Settings → Homepage can name a published builder page (0.113.0); the API
 * publishes its slug as `homepage_page_slug` only then, so absent is the
 * theme's homepage exactly as before. The page is fetched through the same
 * helper as the `[slug]` route — revalidated, tagged `pages` — so a console
 * save purges it and the homepage stays statically renderable.
 *
 * Anything short of a builder page with sections falls back to the theme:
 * a 404 (unpublished since the settings were cached), a page switched to
 * another template, an empty builder. A failure to reach the API does too at
 * runtime, but fails the build, where falling back would bake the wrong
 * homepage into static HTML (`lib/build-phase.ts`).
 */
async function loadBuilderHome(): Promise<CmsPage | null> {
  const slug = (await getSiteSettings()).homepage_page_slug;
  if (!slug) return null;

  try {
    const page = (await publicApi.page(slug)).data;
    return page.template === "builder" && (page.sections?.length ?? 0) > 0 ? page : null;
  } catch (error) {
    if (isPrerendering && !(error instanceof ApiError && error.status === 404)) throw error;
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadBuilderHome();

  // The page's own SEO title and description, but never its canonical: the
  // resolved one names `/{slug}`, which redirects here. A title that is only
  // the page's own name ("Home") is derived, not chosen, and the homepage
  // keeps its usual title instead.
  const seo = page?.seo ? { ...page.seo, canonical_url: null } : null;
  if (seo && page && seo.title === page.title) seo.title = null;
  return buildMetadata({
    title: HOME_TITLE,
    description: homeDescription(),
    path: "/",
    seo,
  });
}

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
 *
 * Unless a builder page has been chosen as the homepage (0.113.0), in which
 * case that page's sections are the homepage instead.
 */
export default async function HomePage() {
  const page = await loadBuilderHome();
  if (page) return <BuilderHome page={page} />;

  const [theme, data] = await Promise.all([activeTheme(), loadHome()]);
  const Home = theme.templates.Home;

  return <Home {...data} options={theme.options} />;
}

/**
 * A builder page as the homepage: the `[slug]` route's builder branch with
 * three differences. No breadcrumb trail — the sections are passed no crumbs,
 * and an opening hero then draws none rather than "Home" alone. No
 * `PageHero`: when nothing opens with a heading the page's title is the `h1`
 * for a screen reader only, since a banner above a designed homepage is not
 * something anybody laid out. And no automatic closing band — the theme's
 * own is a section an editor can place. The answer blocks stay, because the
 * page's `faq_schema` counts its FAQs and question blocks, and a question in
 * structured data must be on the page.
 */
function BuilderHome({ page }: { page: CmsPage }) {
  const sections = page.sections ?? [];
  const showsPageFaqs = sections.some((s) => s.type === "faq" && s.data.source === "page");

  return (
    <>
      {/* An opening builder hero or the theme's own hero (a `theme_section`) is the `h1` — `startsWithHero` counts both. */}
      {!startsWithHero(sections) && <h1 className="sr-only">{page.title}</h1>}

      <PageSections sections={sections} crumbs={[]} ownsH1 />

      <Container className="pb-16 empty:hidden" data-aos="fade-up">
        <AnswerBlocks blocks={page.answer_blocks} faqs={showsPageFaqs ? [] : page.faqs ?? []} className="mt-12" />
        <RelatedEntities entity={page.entity} className="mt-12" />
      </Container>

      {page.faq_schema && <JsonLd data={page.faq_schema} />}
    </>
  );
}
