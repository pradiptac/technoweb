import { cache } from "react";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Alert } from "@/components/ui/input";
import { ApiError, publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { setPreviewRecord, type PreviewKind } from "@/lib/preview-store";
import type { DraftPreview } from "@/types/api";
import CmsPageRoute from "@/app/(marketing)/[slug]/page";
import EntryPage from "@/app/(marketing)/[slug]/[entry]/page";
import BlogPostPage from "@/app/(marketing)/blog/[slug]/page";
import KnowledgeArticlePage from "@/app/(marketing)/knowledge-base/[slug]/page";
import CaseStudyPage from "@/app/(marketing)/case-studies/[slug]/page";
import SolutionPage from "@/app/(marketing)/solutions/[slug]/page";
import ServicePage from "@/app/(marketing)/services/[slug]/page";
import ProductOrCategoryPage from "@/app/(marketing)/products/[slug]/page";
import StoreProductPage from "@/app/(marketing)/store/products/[slug]/page";
import EventPage from "@/app/(marketing)/events/[slug]/page";
import JobPage from "@/app/(marketing)/careers/[slug]/page";
import BrandLandingPage from "@/app/(marketing)/brands/[...rest]/page";
import LocationLandingPage from "@/app/(marketing)/locations/[...rest]/page";

/**
 * A draft opened from its share link (0.138.0, docs/admin-console.md "Draft
 * share links").
 *
 * **The real page, not a copy of it.** The record the link opens is named in
 * the request's preview store (`lib/preview-store.ts`), the twelve detail
 * fetchers in `publicApi` answer from it, and the detail route's own default
 * export is rendered with the params it would have had at its own address. So
 * a draft shows exactly what publishing it will show, in every theme, and a
 * new field on a detail page appears here without anybody remembering to.
 *
 * **A page a secret addresses.** `noindex, nofollow`, no analytics tag, no
 * `Referer` leaving it, never cached by the service worker and out of
 * `robots.txt` — the lists `/ticket-survey` and `/order/` are on. Dynamic on
 * purpose, with no `generateStaticParams`: the link can be revoked at any
 * moment, and a cached render would keep a revoked draft on screen.
 *
 * Every way a link can be dead is one 404 from the API, and so one here.
 */
export const dynamic = "force-dynamic";

const TOKEN = /^[a-f0-9]{64}$/;

/** One lookup per render: the metadata and the page share it. */
const load = cache(async (token: string): Promise<DraftPreview | null> => {
  if (!TOKEN.test(token)) return null;
  try {
    return await publicApi.preview(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await load(token);

  return buildMetadata({
    title: preview ? `Preview: ${preview.meta.title}` : "Preview",
    path: "/preview",
    seo: { ...noIndex, robots: "noindex, nofollow" },
  });
}

/** The kind and key the record is filed under in the store, and the page to draw. */
function plan(preview: DraftPreview): { kind: PreviewKind; key: string; render: () => ReactElement } | null {
  const { type, slug, type_slug: typeSlug, path } = preview.data;
  const rest = (path ?? "").split("/").filter(Boolean).slice(1);
  const params = <T,>(value: T) => Promise.resolve(value);
  const noQuery = Promise.resolve({} as Record<string, string | undefined>);

  switch (type) {
    case "page":
      return slug ? { kind: "page", key: slug, render: () => <CmsPageRoute params={params({ slug })} searchParams={noQuery} /> } : null;
    case "blog_post":
      return slug ? { kind: "post", key: slug, render: () => <BlogPostPage params={params({ slug })} /> } : null;
    case "knowledge_article":
      return slug ? { kind: "knowledge-article", key: slug, render: () => <KnowledgeArticlePage params={params({ slug })} /> } : null;
    case "case_study":
      return slug ? { kind: "case-study", key: slug, render: () => <CaseStudyPage params={params({ slug })} /> } : null;
    case "solution":
      return slug ? { kind: "solution", key: slug, render: () => <SolutionPage params={params({ slug })} /> } : null;
    case "service":
      return slug ? { kind: "service", key: slug, render: () => <ServicePage params={params({ slug })} /> } : null;
    case "product":
      return slug ? { kind: "product", key: slug, render: () => <ProductOrCategoryPage params={params({ slug })} searchParams={Promise.resolve({})} /> } : null;
    case "store_product":
      return slug ? { kind: "store-product", key: slug, render: () => <StoreProductPage params={params({ slug })} /> } : null;
    case "event":
      return slug ? { kind: "event", key: slug, render: () => <EventPage params={params({ slug })} /> } : null;
    case "job_opening":
      return slug ? { kind: "career", key: slug, render: () => <JobPage params={params({ slug })} /> } : null;
    case "entry":
      return slug && typeSlug
        ? { kind: "entry", key: `${typeSlug}/${slug}`, render: () => <EntryPage params={params({ slug: typeSlug, entry: slug })} /> }
        : null;
    case "landing_page":
      if (!path || rest.length === 0) return null;
      if (path.startsWith("/brands/")) return { kind: "landing-page", key: path, render: () => <BrandLandingPage params={params({ rest })} /> };
      if (path.startsWith("/locations/")) return { kind: "landing-page", key: path, render: () => <LocationLandingPage params={params({ rest })} /> };
      return null;
    default:
      return null;
  }
}

export default async function DraftPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await load(token);

  if (!preview) notFound();

  const drawn = plan(preview);
  if (!drawn) notFound();

  // Before the child renders, so every `publicApi` fetcher beneath it sees the record.
  setPreviewRecord(drawn.kind, drawn.key, preview.data.record);

  const { meta } = preview;
  const title = meta.published
    ? "Preview"
    : meta.status === "archived"
      ? "Draft preview — archived, not published"
      : "Draft preview — not published";

  return (
    <>
      {/*
        A standing notice, not a heading: the page beneath owns the one `h1`.
        Not dismissible — it is the only thing saying this is not the live page.
      */}
      <div data-preview-banner className="border-b border-line bg-surface pb-0.5 pt-3">
        <Container>
          <Alert tone="warn" title={title} dismissible={false}>
            This link stops working on {meta.expires_label}.
          </Alert>
        </Container>
      </div>
      {drawn.render()}
    </>
  );
}
