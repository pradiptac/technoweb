import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { Breadcrumbs } from "@/components/ui/page-hero";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ArticleMeta } from "@/components/ui/article-meta";
import { ApiError, publicApi } from "@/lib/api";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
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

  if (!post) return buildMetadata({ title: "Not found", path: `/blog/${slug}`, seo: noIndex });

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
          <Container data-aos="fade-up" className="max-w-[980px] pb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover_image}
              alt={post.cover_image_alt ?? ""}
              className="w-full rounded-xl border border-line object-cover"
            />
          </Container>
        )}

        <Container data-aos="fade-up" className="max-w-[780px] pb-16">
          {post.body && <ProseWithShortcodes html={post.body} className="max-w-none" />}

          <footer className="mt-12 border-t border-line pt-6">
            <Link href="/blog" className="inline-block py-1 text-[14px] font-semibold text-brand-ink hover:underline">
              ← All articles
            </Link>
          </footer>
        </Container>
      </article>

      <CtaBand
        title="Ran into this on your own network?"
        body="If something here matches a problem you are seeing, describe it and we will tell you what we would check first."
      />

      {/*
        Built by the API, rendered here.
        See App\Support\StructuredData — the graph used to be assembled in this
        file, which is how the blog and the case study both ended up declaring
        `dateModified: published_at` and naming the Organization as author while
        the record carried an author_id. Escaping stays in `JsonLd`, because
        JSON.stringify does not escape `<` and a CMS field containing
        `</script>` would otherwise close the block.
      */}
      {post.schema && <JsonLd data={post.schema} />}
    </>
  );
}
