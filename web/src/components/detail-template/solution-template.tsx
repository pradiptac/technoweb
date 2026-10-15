import { CtaBand } from "@/components/ui/cta-band";
import { EnquiryCard } from "@/components/forms/enquiry-card";
import { JsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Solution } from "@/types/api";
import { SolutionBenefits, SolutionHero, SolutionRelated, SolutionWritten } from "./solution-parts";
import { AnswersBlock, Band, BodyBlock, CustomFieldsBlock, EntityBlock, FaqsBlock } from "./shared-blocks";
import { DetailTemplateStack, headingOr, templateEndsOnCta } from "./stack";

/**
 * A solution's page drawn from its detail template (0.161.0): each record
 * block is the part the route draws today, from the record the route loaded.
 * The closing band and the structured data stay the page's own.
 */
export function SolutionTemplate({ solution, preview = false }: { solution: Solution; preview?: boolean }) {
  const template = solution.detail_template!;
  const benefits = solution.benefits ?? [];
  const technologies = solution.technologies ?? [];
  const products = solution.products ?? [];
  const industries = solution.industries ?? [];
  const crumbs = [
    { name: "Solutions", path: "/solutions" },
    { name: solution.title, path: `/solutions/${solution.slug}` },
  ];
  const lists = [technologies, products, industries].filter((l) => l.length > 0).length;

  return (
    <>
      <DetailTemplateStack
        template={template}
        crumbs={crumbs}
        runCode={!preview}
        block={(block, context) => {
          switch (block.type) {
            case "record_hero": return <SolutionHero solution={solution} crumbs={crumbs} />;
            case "record_body":
              return (
                <BodyBlock
                  record={solution}
                  crumbs={crumbs}
                  written={solution.problem_statement || solution.overview ? <div className="min-w-0 *:last:mb-0"><SolutionWritten solution={solution} /></div> : null}
                />
              );
            case "record_highlights":
              return (
                <Band show={benefits.length > 0}>
                  <SolutionBenefits benefits={benefits} heading={headingOr(block, "What you get")} />
                </Band>
              );
            case "record_custom_fields": return <CustomFieldsBlock record={solution} block={block} />;
            case "record_answer_blocks": return <AnswersBlock record={solution} context={context} />;
            case "record_faqs": return <FaqsBlock record={solution} />;
            case "record_related":
              return (
                <EntityBlock record={solution}>
                  {lists > 0 && (
                    // As many columns as there are lists, so one or two never leave a hole in a row of three.
                    <div className={cn("grid items-start gap-5", lists >= 2 && "sm:grid-cols-2", lists >= 3 && "lg:grid-cols-3")}>
                      <SolutionRelated technologies={technologies} products={products} industries={industries} />
                    </div>
                  )}
                </EntityBlock>
              );
            case "record_enquiry":
              return (
                <Band>
                  <div className="mx-auto w-full max-w-xl">
                    <EnquiryCard
                      source={`solution:${solution.slug}`}
                      subject={solution.title}
                      heading={block.data.heading?.trim() || undefined}
                      name={solution.title.toLowerCase()}
                    />
                  </div>
                </Band>
              );
            default: return null;
          }
        }}
      />

      {!templateEndsOnCta(template) && (
        <CtaBand
          title={`Thinking about ${solution.title.toLowerCase()}?`}
          body="Start with a site visit. We will tell you what your current setup can still do, and what genuinely needs replacing."
        />
      )}

      {solution.schema && <JsonLd data={solution.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {solution.faq_schema && <JsonLd data={solution.faq_schema} />}
    </>
  );
}
