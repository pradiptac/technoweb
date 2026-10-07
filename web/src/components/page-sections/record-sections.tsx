import type { Crumb } from "@/components/ui/breadcrumbs";
import type { EntityLinks, PageSection } from "@/types/api";
import { PageSections } from "./page-sections";

/**
 * Builder sections in a record's **body area** (0.129.0, docs/page-builder.md
 * "Sections on other records") — a solution, a service, an industry, a case
 * study.
 *
 * The record's page keeps everything that makes it that kind of page: the
 * theme's heading (its one `h1`), the related lists, the FAQs, the closing
 * band. The sections stand where the written body stood, and nothing else
 * moves. They are full-width bands, as on a builder page, so each route
 * draws them *between* its heading and a container holding the rest — never
 * inside the body's old column, where a band with its own background would
 * be a box inside a box beside an aside.
 *
 * `ownsH1={false}`: the page's `PageHero` above is the `h1`, so every
 * section heading is an `h2` and a tile's an `h3`, exactly as on a builder
 * page that opens with `PageHero`. The API never sends a hero here.
 */
export function RecordSections({ sections, crumbs }: { sections: PageSection[]; crumbs: Crumb[] }) {
  return (
    <div data-record-sections>
      <PageSections sections={sections} crumbs={crumbs} ownsH1={false} />
    </div>
  );
}

/** The API sends `sections` only while the record's page draws them; none is the written body. */
export function laidOutAsSections(record: { sections?: PageSection[] }): boolean {
  return (record.sections?.length ?? 0) > 0;
}

/** Whether the sections end on a call to action of their own — a `cta`, or a content block that is one. */
export function endsOnCta(sections: PageSection[] | undefined): boolean {
  const last = sections?.[sections.length - 1];

  return last?.type === "cta" || (last?.type === "content_block" && last.data.block.type === "cta");
}

/** Whether `RelatedEntities` would draw anything — so a route can leave out a container that would hold nothing. */
export function hasEntityLinks(entity?: EntityLinks | null): boolean {
  if (!entity) return false;

  return Boolean(entity.brand || entity.category)
    || [entity.solutions, entity.services, entity.industries, entity.articles].some((list) => (list?.length ?? 0) > 0);
}
