import Link from "next/link";
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
        kicker="Resources"
        title="Everything we have written down."
        lede="We document as we go — partly so our own engineers can find it again, partly because the answer you need at 9pm should not require a phone call."
        crumbs={[{ name: "Resources", path: "/resources" }]}
      />

      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-lg border border-line-strong bg-card p-5.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-2"
            >
              <IconTile size="lg" className="mb-4">
                <s.icon />
              </IconTile>
              <h2 className="text-[16.5px]">{s.title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted">{s.body}</p>
            </Link>
          ))}
        </div>

        {posts.length > 0 && (
          <section data-aos="fade-up" className="mt-16">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Latest from the blog</h2>
              <ArrowLink href="/blog" className="ml-auto">All articles</ArrowLink>
            </div>
            <ul className="grid gap-3">
              {posts.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <Link href={`/blog/${p.slug}`} className="block rounded-lg border border-line-strong bg-card p-5 transition-colors hover:border-brand-300 hover:bg-brand-50">
                    <h3 className="text-[16px]">{p.title}</h3>
                    {p.excerpt && <p className="mt-1.5 text-[13.5px] text-muted">{p.excerpt}</p>}
                    <ArticleMeta className="mt-2" date={p.published_at} readingMinutes={p.reading_minutes} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {articles.length > 0 && (
          <section data-aos="fade-up" className="mt-14">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Most-used guides</h2>
              <ArrowLink href="/knowledge-base" className="ml-auto">Search the knowledge base</ArrowLink>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {articles.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link href={`/knowledge-base/${a.slug}`} className="block rounded-lg border border-line-strong bg-card p-4.5 transition-colors hover:border-brand-300 hover:bg-brand-50">
                    <h3 className="text-[15px] leading-snug">{a.title}</h3>
                    <ArticleMeta className="mt-1.5" category={a.category?.name} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {studies.length > 0 && (
          <section data-aos="fade-up" className="mt-14">
            <div className="mb-5 flex items-center gap-3">
              <h2 className="display-3">Recent projects</h2>
              <ArrowLink href="/case-studies" className="ml-auto">All case studies</ArrowLink>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {studies.slice(0, 3).map((c) => (
                <li key={c.id}>
                  <Link href={`/case-studies/${c.slug}`} className="block h-full rounded-lg border border-line-strong bg-card p-4.5 transition-colors hover:border-brand-300 hover:bg-brand-50">
                    {c.industry?.name && (
                      <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-ink">{c.industry.name}</span>
                    )}
                    <h3 className="mt-1.5 text-[15px] leading-snug">{c.title}</h3>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <CtaBand />
    </>
  );
}
