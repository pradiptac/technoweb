import { Container } from "@/components/ui/container";
import { ArrowLink } from "@/components/ui/button";
import { AwardBadge, CoverageCard, InvestorRow, ReleaseRow, type PresetEntry } from "@/components/presets/preset-parts";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import type { PresetListSectionData } from "@/types/page-sections";
import { SectionFrame, SectionHead } from "./section-parts";

type Reveal = { reveal?: SectionRevealAttr | null };

/**
 * "From a preset" (docs/content-presets.md): a compact copy of a preset's
 * archive — the newest releases, the coverage, investor documents or awards —
 * with a link to all of it. Drawn from the same parts as the archive, so the
 * two cannot drift. The API drops the section when there is nothing to list.
 */
export function PresetListSection({ data, reveal }: { data: PresetListSectionData } & Reveal) {
  const rows = (data.items ?? []) as PresetEntry[];
  if (rows.length === 0) return null;
  // A heading on the section makes each row a level below it. Card rows size to
  // how many cards there are, so two awards do not sit in a grid of four, aligned with the heading.
  const rowHeading = data.heading ? "h3" : "h2";

  const body = (() => {
    switch (data.preset) {
      case "newsroom_releases":
        return <ul>{rows.map((e) => <ReleaseRow key={e.id} entry={e} headingAs={rowHeading} />)}</ul>;
      case "newsroom_coverage":
        return (
          <ul className="grid grid-cols-1 justify-start gap-6 sm:grid-cols-[repeat(auto-fit,minmax(16rem,22rem))]">
            {rows.map((e) => <CoverageCard key={e.id} entry={e} headingAs={rowHeading} />)}
          </ul>
        );
      case "investors":
        return <ul className="border-t border-line">{rows.map((e) => <InvestorRow key={e.id} entry={e} types={data.document_types} />)}</ul>;
      case "awards":
        return (
          <ul className="grid grid-cols-1 justify-start gap-6 min-[420px]:grid-cols-[repeat(auto-fit,minmax(12rem,16rem))]">
            {rows.map((e) => <AwardBadge key={e.id} entry={e} headingAs={rowHeading} />)}
          </ul>
        );
      default:
        return null;
    }
  })();

  return (
    <SectionFrame type="preset_list" reveal={reveal}>
      <Container data-preset={data.preset}>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        {body}
        {data.index_path ? <p className="mt-8"><ArrowLink href={data.index_path}>See all</ArrowLink></p> : null}
      </Container>
    </SectionFrame>
  );
}
