import { cn } from "@/lib/utils";
import type { LayoutRow as Row } from "@/types/api";
import { LayoutColumn } from "./layout-column";
import type { WidgetPlan } from "./widgets";

/*
 * Every class is a literal. Tailwind generates only the names it can read in
 * the source, so a class built from stored text ("md:grid-cols-" + n) would
 * compile to nothing and the row would silently stack on every screen — the
 * 0.107.0 bug. Each table is keyed by what the API stores; a value it does
 * not know falls back to the default.
 *
 * `minmax(0, …)` on every track, and `min-w-0` on every cell: a grid item's
 * minimum is its min-content, so one unbreakable run in one cell would
 * otherwise widen the whole row past a 320px screen.
 */

/** Columns, by how many there are and where they stop stacking. */
const GRID = {
  1: { md: "grid-cols-1", lg: "grid-cols-1" },
  2: {
    md: { equal: "grid-cols-1 md:grid-cols-2", wide_first: "grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", wide_last: "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" },
    lg: { equal: "grid-cols-1 lg:grid-cols-2", wide_first: "grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", wide_last: "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" },
  },
  3: { md: "grid-cols-1 md:grid-cols-3", lg: "grid-cols-1 lg:grid-cols-3" },
  4: { md: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4", lg: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-4" },
} as const;

const GAP = { s: "gap-4", m: "gap-6 lg:gap-8", l: "gap-8 lg:gap-12" } as const;
const VALIGN = { stretch: "items-stretch", top: "items-start", center: "items-center", bottom: "items-end" } as const;

/** The second column first when the row is stacked — a picture above its words on a phone, or below. */
const REVERSE = { md: "max-md:[&>:nth-child(2)]:order-first", lg: "max-lg:[&>:nth-child(2)]:order-first" } as const;

export function LayoutRow({ row, plans }: { row: Row; plans: Map<string, WidgetPlan> }) {
  const count = Math.min(4, Math.max(1, row.columns.length)) as 1 | 2 | 3 | 4;
  const from = row.stack_from === "lg" ? "lg" : "md";
  const grid = count === 2 ? GRID[2][from][row.split ?? "equal"] ?? GRID[2][from].equal : GRID[count][from];

  return (
    <div
      data-layout-row
      className={cn(
        "grid min-w-0",
        grid,
        GAP[row.gap ?? "m"] ?? GAP.m,
        VALIGN[row.valign ?? "stretch"] ?? VALIGN.stretch,
        count === 2 && row.reverse_stacked && REVERSE[from],
      )}
    >
      {row.columns.map((column, i) => <LayoutColumn key={i} column={column} plans={plans} />)}
    </div>
  );
}
