import { Container } from "@/components/ui/container";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import type { LayoutSectionData, LayoutWidget } from "@/types/api";
import { SectionFrame, SectionHead } from "../section-parts";
import { LayoutRow } from "./layout-row";
import type { WidgetPlan } from "./widgets";

/**
 * The custom layout section (0.147.0, `docs/page-builder.md` "The layout
 * section"): rows of one to four columns, each a short stack of widgets, in
 * the band every section sits in.
 *
 * **The headings are worked out here, once, in document order**, because no
 * widget knows where it is: this section never draws an `h1`; its own heading
 * (when it has one) is an `h2` and every heading widget below it an `h3`;
 * with no heading of its own the first heading widget is the `h2` and the rest
 * `h3`. An icon box's title is a heading only once an `h2` has come before it
 * — a lone `h3` straight under the page's `h1` is the jump the audit fails —
 * and a plain paragraph until then. A container's children (0.154.0) are
 * walked in document order too, so a heading in a tab follows the same rule; a
 * tab's or a panel's own name is a button or a summary, never a heading.
 *
 * The first picture is the only one that loads eagerly (the page's first two
 * sections are above the fold), and the section's reveal is the only motion
 * of its own: widgets do not animate separately.
 */
export function LayoutSection({ data, eager, reveal }: { data: LayoutSectionData; eager: boolean; reveal?: SectionRevealAttr | null }) {
  const plans = new Map<string, WidgetPlan>();
  let h2Seen = Boolean(data.heading);
  let pictureSeen = false;

  // One widget's plan, then its slots' (a container holds ordinary widgets, one level).
  const visit = (widget: LayoutWidget, columns: number) => {
    const plan: WidgetPlan = { level: 3, titleIsHeading: h2Seen, eager: false, columns };
    if (widget.type === "heading") {
      plan.level = h2Seen ? 3 : 2;
      h2Seen = true;
    }
    if (widget.type === "image" && !pictureSeen) {
      plan.eager = eager;
      pictureSeen = true;
    }
    plans.set(widget.id, plan);
    if ("slots" in widget) {
      // Columns inside a column share its width; a box, tab or panel has all of it.
      const per = widget.type === "inner_row" ? widget.slots.length : 1;
      for (const slot of widget.slots) for (const child of slot.widgets) visit(child, columns * per);
    }
  };

  for (const row of data.rows) {
    for (const column of row.columns) {
      for (const widget of column.widgets) visit(widget, row.columns.length);
    }
  }

  return (
    <SectionFrame type="layout" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <div data-layout className="flex min-w-0 flex-col gap-8 lg:gap-10">
          {data.rows.map((row) => <LayoutRow key={row.id} row={row} plans={plans} />)}
        </div>
      </Container>
    </SectionFrame>
  );
}
