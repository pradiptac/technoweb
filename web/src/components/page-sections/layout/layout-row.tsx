import { cn } from "@/lib/utils";
import type { LayoutRow as Row } from "@/types/api";
import { GAP, REVERSE, VALIGN, gridClasses } from "./layout-grid";
import { LayoutColumn } from "./layout-column";
import type { WidgetPlan } from "./widgets";

export function LayoutRow({ row, plans }: { row: Row; plans: Map<string, WidgetPlan> }) {
  const count = Math.min(4, Math.max(1, row.columns.length));
  const from = row.stack_from === "lg" ? "lg" : "md";

  return (
    <div
      data-layout-row
      className={cn(
        "grid min-w-0",
        gridClasses(count, row.stack_from, row.split),
        GAP[row.gap ?? "m"] ?? GAP.m,
        VALIGN[row.valign ?? "stretch"] ?? VALIGN.stretch,
        count === 2 && row.reverse_stacked && REVERSE[from],
      )}
    >
      {row.columns.map((column, i) => <LayoutColumn key={i} column={column} plans={plans} />)}
    </div>
  );
}
