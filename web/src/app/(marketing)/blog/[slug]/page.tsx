import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { Breadcrumbs } from "@/components/ui/page-hero";
import { Prose } from "@/components/ui/prose";
import { ArticleMeta } from "@/components/ui/article-meta";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, SITE, buildMetadata } from "@/lib/seo";
import type { BlogPost } from "@/types/api";

async function load(slug: string): Promise<BlogPost | null> {
  try {
    return (await publicApi.post(slug)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await load(slug);

  if (!post) return buildMetadata({ title: "Not found", path: `/blog/${slug}` });

  return buildMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.cover_image,
    type: "article",
    seo: post.seo,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await load(slug);

  if (!post) notFound();

  return (
    <>
      <article>
        <Container className="max-w-[780px] pt-11 pb-8 lg:pt-14">
          <Breadcrumbs
            crumbs={[
              { name: "Blog", path: "/blog" },
              { name: post.title, path: `/blog/${post.slug}` },
            ]}
          />
          <h1 className="display-2 mt-6">{post.title}</h1>
          {post.excerpt && <p className="lede mt-4">{post.excerpt}</p>}
          <ArticleMeta
            className="mt-5 border-t border-line pt-5"
            date={post.published_at}
            readingMinutes={post.reading_minutes}
            author={post.author?.name}
          />
        </Container>

        {post.cover_image && (
          <Container className="max-w-[980px] pb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover_image}
              alt=""
              className="w-full rounded-xl border border-line object-cover"
            />
          </Container>
        )}

        <Container className="max-w-[780px] pb-16">
          {post.body && <Prose html={post.body} className="max-w-none" />}

          <footer className="mt-12 border-t border-line pt-6">
            <Link href="/blog" className="inline-block py-1 text-[14px] font-semibold text-brand-600 hover:underline">
              ← All articles
            </Link>
          </footer>
        </Container>
      </article>

      <CtaBand
        title="Ran into this on your own network?"
        body="If something here matches a problem you are seeing, describe it and we will tell you what we would check first."
      />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description: post.excerpt ?? undefined,
          image: post.cover_image ?? undefined,
          datePublished: post.published_at ?? undefined,
          dateModified: post.published_at ?? undefined,
          author: { "@type": "Organization", name: SITE.name, url: SITE.url },
          publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
          mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE.url}/blog/${post.slug}` },
        }}
      />
    </>
  );
}
