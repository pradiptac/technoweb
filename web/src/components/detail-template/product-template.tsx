import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/lib/seo";
import type { Product } from "@/types/api";
import {
  ProductDownloads, ProductEnquiry, ProductFeatures, ProductHero, ProductOverview, ProductRelatedHardware, ProductSpecs, ProductTop,
  productCrumbList,
} from "./product-parts";
import { AnswersBlock, Band, BodyBlock, CustomFieldsBlock, EntityBlock, FaqsBlock } from "./shared-blocks";
import { DetailTemplateStack, headingOr, templateEndsOnCta } from "./stack";

/** A catalogue product's page drawn from its detail template (0.161.0); see `SolutionTemplate`. */
export function ProductTemplate({ p, preview = false }: { p: Product; preview?: boolean }) {
  const template = p.detail_template!;
  const crumbs = productCrumbList(p);

  return (
    <>
      <DetailTemplateStack
        template={template}
        crumbs={crumbs}
        runCode={!preview}
        block={(block, context) => {
          switch (block.type) {
            case "record_hero": return <ProductHero p={p} crumbs={crumbs} />;
            // The pictures beside the panel that decides an enquiry.
            case "record_gallery": return <Container className="section-y"><ProductTop p={p} /></Container>;
            case "record_body":
              return <BodyBlock record={p} crumbs={crumbs} written={p.description ? <ProductOverview p={p} /> : null} />;
            case "record_highlights":
              return <Band show={(p.features?.length ?? 0) > 0}><ProductFeatures p={p} heading={headingOr(block, "Key features")} /></Band>;
            case "record_specs":
              return <Band show={Object.keys(p.specifications ?? {}).length > 0}><ProductSpecs p={p} heading={headingOr(block, "Specifications")} /></Band>;
            case "record_downloads":
              return <Band show={(p.downloads?.length ?? 0) > 0}><ProductDownloads p={p} heading={headingOr(block, "Downloads")} /></Band>;
            case "record_custom_fields": return <CustomFieldsBlock record={p} block={block} />;
            case "record_answer_blocks": return <AnswersBlock record={p} context={context} />;
            case "record_faqs": return <FaqsBlock record={p} />;
            case "record_enquiry":
              return <Band><ProductEnquiry p={p} heading={headingOr(block, "Request information")} /></Band>;
            case "record_related":
              return (
                <EntityBlock record={p}>
                  {(p.related_products?.length ?? 0) > 0 && <ProductRelatedHardware p={p} limit={block.data.limit ?? 4} />}
                </EntityBlock>
              );
            default: return null;
          }
        }}
      />

      {!templateEndsOnCta(template) && <CtaBand />}

      {p.schema && <JsonLd data={p.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {p.faq_schema && <JsonLd data={p.faq_schema} />}
    </>
  );
}
