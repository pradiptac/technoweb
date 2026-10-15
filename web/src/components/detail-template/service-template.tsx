import { CtaBand } from "@/components/ui/cta-band";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { EnquiryCard } from "@/components/forms/enquiry-card";
import { JsonLd } from "@/lib/seo";
import type { Service } from "@/types/api";
import { ServiceHero } from "./service-parts";
import { AnswersBlock, Band, BodyBlock, CustomFieldsBlock, EntityBlock, FaqsBlock } from "./shared-blocks";
import { DetailTemplateStack, templateEndsOnCta } from "./stack";

/** A service's page drawn from its detail template (0.161.0); see `SolutionTemplate`. */
export function ServiceTemplate({ service, preview = false }: { service: Service; preview?: boolean }) {
  const template = service.detail_template!;
  const crumbs = [
    { name: "Services", path: "/services" },
    { name: service.title, path: `/services/${service.slug}` },
  ];

  return (
    <>
      <DetailTemplateStack
        template={template}
        crumbs={crumbs}
        runCode={!preview}
        block={(block, context) => {
          switch (block.type) {
            case "record_hero": return <ServiceHero service={service} crumbs={crumbs} />;
            case "record_body":
              return <BodyBlock record={service} crumbs={crumbs} written={service.body ? <ProseWithShortcodes html={service.body} /> : null} />;
            case "record_custom_fields": return <CustomFieldsBlock record={service} block={block} />;
            case "record_answer_blocks": return <AnswersBlock record={service} context={context} />;
            case "record_faqs": return <FaqsBlock record={service} />;
            case "record_related": return <EntityBlock record={service} />;
            case "record_enquiry":
              return (
                <Band>
                  <div className="mx-auto w-full max-w-xl">
                    <EnquiryCard
                      source={`service:${service.slug}`}
                      subject={service.title}
                      heading={block.data.heading?.trim() || undefined}
                      name={service.title.toLowerCase()}
                    />
                  </div>
                </Band>
              );
            default: return null;
          }
        }}
      />

      {!templateEndsOnCta(template) && <CtaBand />}

      {service.schema && <JsonLd data={service.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {service.faq_schema && <JsonLd data={service.faq_schema} />}
    </>
  );
}
