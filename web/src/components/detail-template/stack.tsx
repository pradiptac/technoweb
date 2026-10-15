import { Fragment, type ReactNode } from "react";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { PageSections } from "@/components/page-sections/page-sections";
import { endsOnCta } from "@/components/page-sections/record-sections";
import {
  isRecordBlock, type DetailTemplateRead, type PageSection, type RecordBlockSection,
} from "@/types/page-sections";

/**
 * A detail template drawn around the record a route has loaded (0.161.0,
 * docs/page-builder.md "Detail templates").
 *
 * The template is a stack of **ordinary sections** the API has presented and
 * **record blocks** it has only named. Consecutive ordinary sections go to
 * `PageSections` as one run — so a background, a reveal and a style mean here
 * what they mean on a builder page — and each record block is handed to the
 * kind's own view (`block`), which draws it from the record **with the very
 * components the route draws that part with today**: nothing is fetched again
 * and there is no second copy of a heading or a buy panel to drift.
 *
 * **One `h1`, always.** `record_hero` carries the page's title. A template
 * that leaves it out still gets a heading — the route's own, put first — so a
 * page can never lose its title or gain a second one; an ordinary `hero`
 * section is refused on save (`RecordSections::EXCLUDED`), so
 * `ownsH1={false}` and every section heading is an `h2`.
 *
 * Stacks are not split on a sticky in-page menu: a menu is held by its own
 * run's wrapper, so one placed in a template menus the sections of its run.
 */
export type BlockContext = {
  /** The template places `record_faqs`, so `record_answer_blocks` leaves the questions to it. */
  hasFaqs: boolean;
};

const HERO: RecordBlockSection = { id: "record-hero", type: "record_hero", background: null, data: {} };

type Run = { key: string; block: RecordBlockSection } | { key: string; sections: PageSection[] };

export function DetailTemplateStack({ template, crumbs, block, runCode = true }: {
  template: DetailTemplateRead;
  crumbs: Crumb[];
  block: (section: RecordBlockSection, context: BlockContext) => ReactNode;
  /** False in the console's preview: pasted code is drawn as a labelled placeholder there, never run (see `PageSections`). */
  runCode?: boolean;
}) {
  const given = template.sections;
  const context: BlockContext = { hasFaqs: given.some((s) => s.type === "record_faqs") };
  const stack = given.some((s) => s.type === "record_hero") ? given : [HERO, ...given];

  const runs: Run[] = [];
  for (const section of stack) {
    if (isRecordBlock(section)) {
      runs.push({ key: section.id, block: section });
      continue;
    }
    const last = runs[runs.length - 1];
    if (last && "sections" in last) last.sections.push(section);
    else runs.push({ key: section.id, sections: [section] });
  }

  return (
    <>
      {runs.map((run) => (
        "block" in run
          ? <Fragment key={run.key}>{block(run.block, context)}</Fragment>
          : <PageSections key={run.key} sections={run.sections} crumbs={crumbs} ownsH1={false} runCode={runCode} />
      ))}
    </>
  );
}

/** Whether the template ends on a call to action of its own, so the route's closing band would be a second. */
export function templateEndsOnCta(template: DetailTemplateRead): boolean {
  const last = template.sections[template.sections.length - 1];

  return last !== undefined && !isRecordBlock(last) && endsOnCta([last]);
}

/** The words a block's `heading` setting replaces, or the page's own. */
export function headingOr(block: RecordBlockSection, fallback: string): string {
  return block.data.heading?.trim() || fallback;
}
