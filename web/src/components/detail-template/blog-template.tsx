import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { ReadingProgress } from "@/components/ui/article-map";
import { RelatedEntities } from "@/components/content/related-entities";
import { CategoryStrip } from "@/components/blog/category-strip";
import { PostNav } from "@/components/blog/post-nav";
import { withHeadingIds } from "@/lib/headings";
import { JsonLd } from "@/lib/seo";
import type { BlogPost } from "@/types/api";
import { BlogBody, BlogComments, BlogFooter, BlogHead, BlogRelatedStories, loadBlogContext } from "./blog-parts";
import { AnswersBlock, Band, BodyBlock, CustomFieldsBlock, FaqsBlock } from "./shared-blocks";
import { DetailTemplateStack, templateEndsOnCta } from "./stack";

/**
 * A blog post's page drawn from its detail template (0.161.0); see
 * `SolutionTemplate`. The sidebar and the map beside the written body are the
 * default layout's furniture and are not part of a template: the article is a
 * column of its own blocks.
 */
export async function BlogTemplate({ post, preview = false }: { post: BlogPost; preview?: boolean }) {
  const template = post.detail_template!;
  const { taxonomy, alsoReadPool, comments } = await loadBlogContext(post, post.slug);
  const { html: body } = withHeadingIds(post.body ?? "");
  const crumbs = [
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ];
  const discussed = comments !== null && (comments.meta.open || comments.meta.total > 0);

  return (
    <>
      <CategoryStrip categories={taxonomy?.categories ?? []} active={post.categories?.[0]?.slug} />

      <article id="post-body">
        <ReadingProgress target="post-body" />
        <DetailTemplateStack
          template={template}
          crumbs={crumbs}
          runCode={!preview}
          block={(block, context) => {
            switch (block.type) {
              case "record_hero":
                return (
                  <Container className="section-y pb-10">
                    <div className="mx-auto max-w-[900px]"><BlogHead post={post} crumbs={crumbs} /></div>
                  </Container>
                );
              case "record_body":
                return <BodyBlock record={post} crumbs={crumbs} written={body ? <div className="mx-auto max-w-[900px]"><BlogBody body={body} /></div> : null} />;
              case "record_custom_fields": return <CustomFieldsBlock record={post} block={block} />;
              case "record_answer_blocks": return <AnswersBlock record={post} context={context} />;
              case "record_faqs": return <FaqsBlock record={post} />;
              case "record_comments":
                return <Band show={discussed}><div className="mx-auto max-w-[900px]"><BlogComments post={post} comments={comments} /></div></Band>;
              case "record_related":
                return (
                  <Band>
                    <div className="mx-auto grid max-w-[900px] gap-12">
                      <RelatedEntities entity={post.entity} />
                      <PostNav previous={post.previous} next={post.next} />
                      <BlogFooter />
                    </div>
                    <BlogRelatedStories alsoRead={alsoReadPool.slice(0, block.data.limit ?? 4)} />
                  </Band>
                );
              default: return null;
            }
          }}
        />
      </article>

      {!templateEndsOnCta(template) && (
        <CtaBand
          title="Ran into this on your own network?"
          body="If something here matches a problem you are seeing, describe it and we will tell you what we would check first."
        />
      )}

      {post.schema && <JsonLd data={post.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {post.faq_schema && <JsonLd data={post.faq_schema} />}
    </>
  );
}
