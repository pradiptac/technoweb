import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LayoutColumn as Column } from "@/types/api";
import { Widget, type WidgetPlan } from "./widgets";

/** An explicit alignment, logical so it follows the writing direction. `inherit` sets none: the section's own choice shows through. */
export const TEXT_ALIGN = { inherit: "", start: "text-start", center: "text-center", end: "text-end" } as const;

const VALIGN = { top: "justify-start", center: "justify-center", bottom: "justify-end" } as const;
const PAD = { none: "none", s: "sm", m: "lg" } as const;

/**
 * One column: a stack of widgets, in a box when the editor chose one.
 *
 * A box is the site's `Card`, so the card ground every audit requires, the
 * border and corners every theme restyles by `[data-card]`, and the contrast
 * arithmetic all come with it — there is deliberately no "outline" surface, a
 * bordered box with no ground being exactly the card-shaped box the audit
 * fails. `raised` adds the floating-layer shadow. Static, not the hover-lifting
 * card: the box holds its own buttons and links, and a lift under the pointer
 * would say the whole box is one.
 */
export function LayoutColumn({ column, plans }: { column: Column; plans: Map<string, WidgetPlan> }) {
  const inner = cn(
    "flex h-full min-w-0 flex-col gap-4",
    VALIGN[column.valign ?? "top"] ?? VALIGN.top,
    TEXT_ALIGN[column.align ?? "inherit"] ?? "",
  );
  const widgets = column.widgets.map((widget) => (
    <Widget key={widget.id} widget={widget} plan={plans.get(widget.id)} plans={plans} columnAlign={column.align ?? "inherit"} />
  ));

  if (column.surface === "card" || column.surface === "raised") {
    return (
      <Card
        interactive={false}
        padding={PAD[column.pad ?? "m"] ?? "lg"}
        className={cn("h-full min-w-0", column.surface === "raised" && "shadow-3")}
      >
        <div data-layout-col className={inner}>{widgets}</div>
      </Card>
    );
  }

  return <div data-layout-col className={inner}>{widgets}</div>;
}
