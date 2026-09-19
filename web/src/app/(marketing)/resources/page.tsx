import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { ArticleMeta } from "@/components/ui/article-meta";
import { ArrowLink } from "@/components/ui/button";
import { IconBook, IconBuilding, IconCode, IconTicket } from "@/components/icons";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import type { BlogPost, CaseStudy, KnowledgeArticle } from "@/types/api";
import { IconTile } from "@/components/ui/icon-tile";

export const metadata = buildMetadata({
  title: "Resources",
  description:
    "Field notes, configuration guides, knowledge-base articles and project case studies from the Technoware engineering team.",
  path: "/resources",
});

const sections = [
  { href: "/blog", icon: IconCode, title: "Blog", body: "Field notes and post-mortems from live deployments." },
  { href: "/knowledge-base", icon: IconBook, title: "Knowledge base", body: "Step-by-step configuration and troubleshooting guides." },
  { href: "/case-studies", icon: IconBuilding, title: "Case studies", body: "Projects with the constraints and outcomes written down." },
  { href: "/portal/tickets/new", icon: IconTicket, title: "Support", body: "Already a customer? Raise a ticket with the desk." },
];

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
        {/* Four `Collection`s on this hub, each drawn in the theme's idiom — see `components/ui/collection.tsx`. */}
        <Collection kind="routes" cols={4}>
          {sections.map((s) => (
            <Tile
              key={s.href}
              href={s.href}
              titleAs="h2"
              title={s.title}
              summary={s.body}
              icon={<IconTile size="lg"><s.icon /></IconTile>}
              cta="Open"
            />
          ))}
        </Collection>

        {posts.length > 0 && (
          <section data-aos="fade-up" className="mt-16">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Latest from the blog</h2>
              <ArrowLink href="/blog" className="ml-auto">All articles</ArrowLink>
            </div>
            <Collection kind="posts" cols={1} gap="sm">
              {posts.slice(0, 4).map((p) => (
                <Tile
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  title={p.title}
                  summary={p.excerpt}
                  meta={<ArticleMeta date={p.published_at} readingMinutes={p.reading_minutes} />}
                  cta="Read the article"
                />
              ))}
            </Collection>
          </section>
        )}

        {articles.length > 0 && (
          <section data-aos="fade-up" className="mt-14">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Most-used guides</h2>
              <ArrowLink href="/knowledge-base" className="ml-auto">Search the knowledge base</ArrowLink>
            </div>
            <Collection kind="articles" cols={2} gap="sm">
              {articles.slice(0, 6).map((a) => (
                <Tile
                  key={a.id}
                  href={`/knowledge-base/${a.slug}`}
                  title={a.title}
                  meta={<ArticleMeta category={a.category?.name} />}
                  padding="sm"
                  cta="Read the guide"
                />
              ))}
            </Collection>
          </section>
        )}

        {studies.length > 0 && (
          <section data-aos="fade-up" className="mt-14">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Recent projects</h2>
              <ArrowLink href="/case-studies" className="ml-auto">All case studies</ArrowLink>
            </div>
            <Collection kind="case-studies" cols={3} gap="sm">
              {studies.slice(0, 3).map((c) => (
                <Tile
                  key={c.id}
                  href={`/case-studies/${c.slug}`}
                  kicker={c.industry?.name}
                  title={c.title}
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
