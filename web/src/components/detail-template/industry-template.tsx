import { CtaBand } from "@/components/ui/cta-band";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { JsonLd } from "@/lib/seo";
import type { Industry } from "@/types/api";
import { IndustryHero, IndustrySolutions } from "./industry-parts";
import { AnswersBlock, BodyBlock, CustomFieldsBlock, EntityBlock, FaqsBlock } from "./shared-blocks";
import { DetailTemplateStack, templateEndsOnCta } from "./stack";

/** An industry's page drawn from its detail template (0.161.0); see `SolutionTemplate`. */
export function IndustryTemplate({ industry, preview = false }: { industry: Industry; preview?: boolean }) {
  const template = industry.detail_template!;
  const crumbs = [
    { name: "Industries", path: "/industries" },
    { name: industry.name, path: `/industries/${industry.slug}` },
  ];

  return (
    <>
      <DetailTemplateStack
        template={template}
        crumbs={crumbs}
        runCode={!preview}
        block={(block, context) => {
          switch (block.type) {
            case "record_hero": return <IndustryHero industry={industry} crumbs={crumbs} />;
            case "record_body":
              return <BodyBlock record={industry} crumbs={crumbs} written={industry.body ? <ProseWithShortcodes html={industry.body} /> : null} />;
            case "record_custom_fields": return <CustomFieldsBlock record={industry} block={block} />;
            case "record_answer_blocks": return <AnswersBlock record={industry} context={context} />;
            case "record_faqs": return <FaqsBlock record={industry} />;
            // The solutions we start with, and the line inviting a description of the setup, follow the links.
            case "record_related": return <EntityBlock record={industry}><IndustrySolutions industry={industry} /></EntityBlock>;
            default: return null;
          }
        }}
      />

      {!templateEndsOnCta(template) && <CtaBand />}

      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {industry.faq_schema && <JsonLd data={industry.faq_schema} />}
    </>
  );
}
