import type { CSSProperties } from "react";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ArticleMeta } from "@/components/ui/article-meta";
import { ArrowLink } from "@/components/ui/button";
import { IconBook, IconBuilding, IconCode, IconTicket } from "@/components/icons";
import { tagIndex } from "@/components/blog/category-chips";
import { publicApi } from "@/lib/api";
import { hueFor } from "@/lib/hues";
import { buildMetadata } from "@/lib/seo";
import type { BlogPost, CaseStudy, KnowledgeArticle } from "@/types/api";
import { hueForIcon, IconTile } from "@/components/ui/icon-tile";

export const metadata = buildMetadata({
  title: "Resources",
  description:
    "Field notes, configuration guides, knowledge-base articles and project case studies from the Technoware engineering team.",
  path: "/resources",
});

/**
 * The four routes, each with a fixed hue in sequence — the support hub's
 * rule, and the one documented exception to an icon taking its colour from
 * what it is: these are a set laid out in a fixed order, so position decides.
 * The same hue goes on the tile and its icon so the wash and the glyph agree.
 */
const sections = [
  { href: "/blog", icon: IconCode, title: "Blog", body: "Field notes and post-mortems from live deployments.", hue: "var(--color-neon-8)" },
  { href: "/knowledge-base", icon: IconBook, title: "Knowledge base", body: "Step-by-step configuration and troubleshooting guides.", hue: "var(--color-neon-6)" },
  { href: "/case-studies", icon: IconBuilding, title: "Case studies", body: "Projects with the constraints and outcomes written down.", hue: "var(--color-neon-4)" },
  { href: "/portal/tickets/new", icon: IconTicket, title: "Support", body: "Already a customer? Raise a ticket with the desk.", hue: "var(--color-neon-5)" },
];

/**
 * A rule down the left of a list row in the row's own colour — a class
 * rather than a theme rule, so it holds under every idiom; a row with no
 * hue keeps the line colour.
 */
const RULED = "border-l-[3px] border-l-[var(--tile-hue,var(--color-line-strong))]";

/**
 * A list's heading with a rule of the list's lead colour beside it — the one
 * colour cue at the top of each block that survives every theme's idiom,
 * because it is on the heading and not on the tiles.
 */
function HubHeading({ title, href, cta, hue }: { title: string; href: string; cta: string; hue: string }) {
  return (
    <div className="mb-5 flex items-center gap-3" style={{ "--section-hue": hue } as CSSProperties}>
      <span aria-hidden className="h-7 w-[3px] shrink-0 rounded-full bg-[var(--section-hue)]" />
      <h2 className="display-3">{title}</h2>
      <ArrowLink href={href} className="ml-auto">{cta}</ArrowLink>
    </div>
  );
}

export default async function ResourcesPage() {
  // A hub page should degrade to its navigation if the content endpoints are
  // unavailable — the links below are the point, the previews are a bonus.
  const [posts, articles, studies] = await Promise.all([
    publicApi.posts().then((r) => r.data).catch(() => [] as BlogPost[]),
    publicApi.knowledgeArticles().then((r) => r.data).catch(() => [] as KnowledgeArticle[]),
    publicApi.caseStudies().then((r) => r.data).catch(() => [] as CaseStudy[]),
  ]);

  return (
    <>
      <PageHero
        section="resources"
        kicker="Resources"
        title="Everything we have written down."
        lede="We document as we go — partly so our own engineers can find it again, partly because the answer you need at 9pm should not require a phone call."
        crumbs={[{ name: "Resources", path: "/resources" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {/*
          Four `Collection`s on this hub, each drawn in the theme's idiom —
          see `components/ui/collection.tsx` — and every tile carrying a hue
          since 2026-09-21: the routes by position, a post by its category
          (the same `tagIndex` its chips use, so the colour is the one the
          blog already gave it), a guide by its category, a project by its
          industry's identity icon. `--tile-hue` is what the base wash and
          each theme's `[data-collection="routes"]` idiom read.
        */}
        <Collection kind="routes" cols={4}>
          {sections.map((s) => (
            <Tile
              key={s.href}
              href={s.href}
              titleAs="h2"
              title={s.title}
              summary={s.body}
              hue={s.hue}
              icon={<IconTile size="lg" hue={s.hue}><s.icon /></IconTile>}
              cta="Open"
            />
          ))}
        </Collection>

        {posts.length > 0 && (
          <section data-aos="fade-up" data-hub-section="posts" className="mt-16">
            <HubHeading title="Latest from the blog" href="/blog" cta="All articles" hue="var(--color-neon-8)" />
            <Collection kind="posts" cols={1} gap="sm">
              {posts.slice(0, 4).map((p) => (
                <Tile
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  kicker={p.categories?.[0]?.name}
                  title={p.title}
                  summary={p.excerpt}
                  hue={p.categories?.[0] ? `var(--color-tag-${tagIndex(p.categories[0].slug)})` : undefined}
                  className={RULED}
                  meta={<ArticleMeta date={p.published_at} readingMinutes={p.reading_minutes} />}
                  cta="Read the article"
                />
              ))}
            </Collection>
          </section>
        )}

        {articles.length > 0 && (
          <section data-aos="fade-up" data-hub-section="articles" className="mt-14">
            <HubHeading title="Most-used guides" href="/knowledge-base" cta="Search the knowledge base" hue="var(--color-neon-6)" />
            <Collection kind="articles" cols={2} gap="sm">
              {articles.slice(0, 6).map((a) => (
                <Tile
                  key={a.id}
                  href={`/knowledge-base/${a.slug}`}
                  title={a.title}
                  hue={a.category ? hueFor(a.category.slug) : undefined}
                  className={RULED}
                  meta={<ArticleMeta category={a.category?.name} />}
                  padding="sm"
                  cta="Read the guide"
                />
              ))}
            </Collection>
          </section>
        )}

        {studies.length > 0 && (
          <section data-aos="fade-up" data-hub-section="case-studies" className="mt-14">
            <HubHeading title="Recent projects" href="/case-studies" cta="All case studies" hue="var(--color-neon-4)" />
            <Collection kind="case-studies" cols={3} gap="sm">
              {studies.slice(0, 3).map((c) => (
                <Tile
                  key={c.id}
                  href={`/case-studies/${c.slug}`}
                  kicker={c.industry?.name}
                  title={c.title}
                  hue={c.industry ? hueForIcon(c.industry.icon) : undefined}
                  className={RULED}
                  padding="sm"
                  cta="Read the case study"
                />
              ))}
            </Collection>
          </section>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
