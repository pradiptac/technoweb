import { Container } from "@/components/ui/container";
import { StoreFilterBar } from "@/components/store/store-filter-bar";
import { ReviewsSection } from "@/components/store/reviews/reviews-section";
import { JsonLd } from "@/lib/seo";
import type { StoreProduct } from "@/types/api";
import {
  StoreAlsoLike, StoreApplications, StoreBuyGrid, StoreDetails, StoreDownloads, StoreFeatures, StoreProductHero, StoreRecent, StoreSpecs,
  StoreWatch, loadStoreProductContext, storeProductCrumbs,
} from "./store-product-parts";
import { AnswersBlock, Band, BodyBlock, CustomFieldsBlock, EntityBlock, FaqsBlock } from "./shared-blocks";
import { DetailTemplateStack, headingOr } from "./stack";

/**
 * A shop product's page drawn from its detail template (0.161.0); see
 * `SolutionTemplate`. `record_buy` is **one block** — the filter strip, the
 * pictures and the buy panel in the grid the shop draws them in — so the
 * panel keeps its sticky two-row area. The page's own reads are fetched here,
 * after the 404, in the one round the route uses.
 */
export async function StoreProductTemplate({ product, preview = false }: { product: StoreProduct; preview?: boolean }) {
  const template = product.detail_template!;
  const { categories, settings, firstReviews, watchRows, alsoLikePool } = await loadStoreProductContext(product, product.slug);
  const crumbs = storeProductCrumbs(product);

  return (
    <>
      <DetailTemplateStack
        template={template}
        crumbs={crumbs}
        runCode={!preview}
        block={(block, context) => {
          switch (block.type) {
            case "record_hero": return <StoreProductHero product={product} crumbs={crumbs} />;
            case "record_buy":
              return (
                // `data-hero-gap="keep"` and `pt-3` for the reason the route records: an unlayered rule owns the space under a hero.
                <section className="section-y pt-3" data-hero-gap="keep">
                  <Container>
                    <StoreFilterBar categories={categories} category={product.category?.slug} />
                    <StoreBuyGrid product={product} settings={settings}>
                      <div className="min-w-0">
                        <StoreWatch rows={watchRows} settings={settings} />
                      </div>
                    </StoreBuyGrid>
                  </Container>
                </section>
              );
            case "record_highlights":
              return <Band show={(product.features?.length ?? 0) > 0}><StoreFeatures product={product} heading={headingOr(block, "What you get")} /></Band>;
            case "record_specs":
              return <Band show={Object.keys(product.specifications ?? {}).length > 0}><StoreSpecs product={product} heading={headingOr(block, "Specification")} /></Band>;
            case "record_body":
              return (
                <BodyBlock
                  record={product}
                  crumbs={crumbs}
                  written={product.description || product.applications
                    ? <div className="[&>*:first-child]:mt-0"><StoreDetails product={product} /><StoreApplications product={product} /></div>
                    : null}
                />
              );
            case "record_downloads":
              return <Band show={(product.downloads?.length ?? 0) > 0}><StoreDownloads product={product} heading={headingOr(block, "Downloads")} /></Band>;
            case "record_custom_fields": return <CustomFieldsBlock record={product} block={block} />;
            case "record_answer_blocks": return <AnswersBlock record={product} context={context} />;
            case "record_faqs": return <FaqsBlock record={product} />;
            case "record_reviews":
              return (
                <Band>
                  <ReviewsSection slug={product.slug} productName={product.name} rating={product.rating ?? null} initial={firstReviews} />
                </Band>
              );
            case "record_related":
              return (
                <EntityBlock record={product}>
                  <StoreAlsoLike alsoLike={alsoLikePool.slice(0, block.data.limit ?? 4)} />
                  <StoreRecent product={product} />
                </EntityBlock>
              );
            default: return null;
          }
        }}
      />

      {product.schema && <JsonLd data={product.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {product.faq_schema && <JsonLd data={product.faq_schema} />}
    </>
  );
}
