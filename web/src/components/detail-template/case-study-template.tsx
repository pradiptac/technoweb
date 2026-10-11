import { CtaBand } from "@/components/ui/cta-band";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { JsonLd } from "@/lib/seo";
import type { CaseStudy } from "@/types/api";
import { CaseStudyBack, CaseStudyCover, CaseStudyHero, CaseStudyResults } from "./case-study-parts";
import { Band, BodyBlock, CustomFieldsBlock, EntityBlock } from "./shared-blocks";
import { DetailTemplateStack, templateEndsOnCta } from "./stack";

/** A case study's page drawn from its detail template (0.161.0); see `SolutionTemplate`. */
export function CaseStudyTemplate({ study, preview = false }: { study: CaseStudy; preview?: boolean }) {
  const template = study.detail_template!;
  const crumbs = [
    { name: "Case studies", path: "/case-studies" },
    { name: study.title, path: `/case-studies/${study.slug}` },
  ];

  return (
    <>
      <DetailTemplateStack
        template={template}
        crumbs={crumbs}
        runCode={!preview}
        block={(block) => {
          switch (block.type) {
            case "record_hero": return <CaseStudyHero study={study} crumbs={crumbs} />;
            case "record_highlights":
              return (
                <Band show={(study.results?.length ?? 0) > 0}>
                  {block.data.heading?.trim() && <h2 className="display-3 mb-6">{block.data.heading.trim()}</h2>}
                  <CaseStudyResults study={study} flush />
                </Band>
              );
            case "record_gallery":
              return (
                <Band show={Boolean(study.cover_image)}>
                  <CaseStudyCover study={study} flush />
                </Band>
              );
            case "record_body":
              return <BodyBlock record={study} crumbs={crumbs} written={study.body ? <ProseWithShortcodes html={study.body} /> : null} />;
            case "record_custom_fields": return <CustomFieldsBlock record={study} block={block} />;
            // A case study has no answer blocks or FAQs of its own; the way back follows the links.
            case "record_related": return <EntityBlock record={study}><CaseStudyBack /></EntityBlock>;
            default: return null;
          }
        }}
      />

      {!templateEndsOnCta(template) && (
        <CtaBand
          title="Similar setup to yours?"
          body="Most of these started as an audit. If the shape of the problem looks familiar, that is the place to begin."
        />
      )}

      {study.schema && <JsonLd data={study.schema} />}
      {study.faq_schema && <JsonLd data={study.faq_schema} />}
    </>
  );
}
