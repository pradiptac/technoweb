import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { RecordSections, hasEntityLinks, laidOutAsSections } from "@/components/page-sections/record-sections";
import type { Crumb } from "@/components/ui/breadcrumbs";
import type { AnswerContent, Faq, PublicCustomFields } from "@/types/api";
import type { RecordBlockSection, RecordSectionsRead } from "@/types/page-sections";
import { cn } from "@/lib/utils";
import { headingOr, type BlockContext } from "./stack";

/**
 * The record blocks every kind of record shares (0.161.0, docs/page-builder.md
 * "Detail templates"): the custom fields, the answer blocks and FAQs, the
 * related links, and the body. Each reuses the component the route draws
 * the same part with — `CustomFieldDetails`, `AnswerBlocks`,
 * `RelatedEntities`, `RecordSections` — inside the page's own container and
 * rhythm, and draws **nothing at all** when the record has nothing to show,
 * so an empty block leaves no gap.
 */
export type TemplateRecord = PublicCustomFields & AnswerContent & RecordSectionsRead & { faqs?: Faq[] };

/** A band the way a template draws a part: the page's container and rhythm, or nothing. */
export function Band({ show = true, children, className }: { show?: boolean; children: ReactNode; className?: string }) {
  if (!show) return null;

  return <Container data-aos="fade-up" className={cn("section-y", className)}>{children}</Container>;
}

/** `record_body`: the record's sections when it is laid out as them, otherwise what was written. */
export function BodyBlock({ record, crumbs, written }: { record: TemplateRecord; crumbs: Crumb[]; written: ReactNode }) {
  if (laidOutAsSections(record)) return <RecordSections sections={record.sections ?? []} crumbs={crumbs} />;

  return <Band show={Boolean(written)}>{written}</Band>;
}

export function CustomFieldsBlock({ record, block }: { record: TemplateRecord; block: RecordBlockSection }) {
  return (
    <Band show={(record.custom_fields?.length ?? 0) > 0}>
      <CustomFieldDetails fields={record.custom_fields} title={headingOr(block, "Details")} />
    </Band>
  );
}

/** Answer blocks, with the FAQs merged into their questions — unless the template places `record_faqs` too. */
export function AnswersBlock({ record, context }: { record: TemplateRecord; context: BlockContext }) {
  const blocks = record.answer_blocks ?? [];
  const faqs = context.hasFaqs ? [] : (record.faqs ?? []);
  const show = context.hasFaqs ? blocks.some((b) => b.kind !== "question") : blocks.length > 0 || faqs.length > 0;

  return (
    <Band show={show}>
      <AnswerBlocks blocks={blocks} faqs={faqs} part={context.hasFaqs ? "answers" : "all"} />
    </Band>
  );
}

/** The FAQs and the question blocks as the one accordion `faq_schema` is built over. */
export function FaqsBlock({ record }: { record: TemplateRecord }) {
  const blocks = record.answer_blocks ?? [];
  const show = (record.faqs?.length ?? 0) > 0 || blocks.some((b) => b.kind === "question");

  return (
    <Band show={show}>
      <AnswerBlocks blocks={blocks} faqs={record.faqs ?? []} part="questions" />
    </Band>
  );
}

/** What the record is connected to; a kind adds its own lists beside it. */
export function EntityBlock({ record, children, className }: { record: TemplateRecord; children?: ReactNode; className?: string }) {
  const entity = hasEntityLinks(record.entity);

  return (
    <Band show={entity || Boolean(children)} className={className}>
      <div className="grid gap-12">
        <RelatedEntities entity={record.entity} />
        {children}
      </div>
    </Band>
  );
}
