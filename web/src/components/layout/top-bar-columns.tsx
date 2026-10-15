import Link from "next/link";
import { PANEL_CLASSES } from "@/components/layout/mega-menu";
import { MenuBadge } from "@/components/ui/menu-badge";
import type { MenuItem } from "@/lib/navigation";
import { navKey, newTabAttrs } from "@/lib/nav-key";
import { cn } from "@/lib/utils";

/**
 * The top bar's `columns` panel (0.150.0), after the client's reference — a
 * wide panel under the bar with a thin brand line along its top edge,
 * everything visible at once and nothing to switch.
 *
 * Each first-level child is a column: its label the small uppercase,
 * letter-spaced, muted heading, its children the items beneath — a bold title
 * with an outlined status chip beside it and the summary under, up to three
 * lines. A child with no children of its own is an item in a leading column
 * with no heading, so a link dropped among the groups is not lost. No icons and
 * no cards.
 *
 * The width follows the count: each column is a fixed 240px, at most four to a
 * row, so three groups open 832px and one opens 336px, and it is never wider
 * than the window — past that the columns wrap (`flex-wrap`). The brand line is
 * `border-t-brand-600`, a token and never a hex; the panel is otherwise the
 * bar's own `--color-topbar-*`, which is why the chip inks are the
 * `--color-topbar-live/beta/new` tokens `badgeInks()` walks for that ground.
 * Opened and closed by `PANEL_CLASSES` like its siblings, anchored `right-0`
 * for the same reason, and restyled per theme under
 * `[data-panel="topbar"][data-topbar-style="columns"]`.
 */
const COLUMN_WIDTH = 240;
const COLUMN_GAP = 32;
const PANEL_PAD = 24;
const MAX_ACROSS = 4;

type Column = { key: string; heading: MenuItem | null; entries: MenuItem[] };

export function TopBarColumns({ items }: { items: MenuItem[] }) {
  const loose = items.filter((item) => item.href !== null && !(item.children && item.children.length > 0));
  const groups = items.filter((item) => item.children && item.children.length > 0);
  const columns: Column[] = [
    ...(loose.length > 0 ? [{ key: "loose", heading: null, entries: loose }] : []),
    ...groups.map((group) => ({ key: navKey(group), heading: group, entries: group.children ?? [] })),
  ];
  const across = Math.max(1, Math.min(columns.length, MAX_ACROSS));
  // + the panel's two 1px side borders: without them the row is 2px short and
  // the last column wraps under the first (measured at two columns).
  const width = across * COLUMN_WIDTH + (across - 1) * COLUMN_GAP + PANEL_PAD * 2 + 2;

  return (
    <div className={`${PANEL_CLASSES} right-0`} style={{ width: `min(${width}px, calc(100vw - 2rem))` }}>
      <div
        data-panel="topbar"
        data-topbar-style="columns"
        className="overflow-hidden rounded-b-xl border border-t-2 border-topbar-line border-t-brand-600 bg-topbar text-topbar-ink shadow-2"
      >
        <div className="flex flex-wrap gap-x-8 gap-y-8 p-6">
          {columns.length === 0 && <p className="text-13 text-topbar-muted">Nothing here yet.</p>}
          {columns.map((column) => (
            <div key={column.key} data-topbar-column className="w-[240px] max-w-full shrink-0">
              {column.heading &&
                (column.heading.href === null ? (
                  <p data-topbar-heading className="text-12 font-semibold uppercase tracking-[.14em] text-topbar-muted">
                    {column.heading.label}
                  </p>
                ) : (
                  <Link
                    data-topbar-heading
                    href={column.heading.href}
                    {...newTabAttrs(column.heading.newTab)}
                    className="block text-12 font-semibold uppercase tracking-[.14em] text-topbar-muted transition-colors duration-(--duration-base) hover:text-topbar-ink"
                  >
                    {column.heading.label}
                  </Link>
                ))}
              <ul className={cn("grid gap-1", column.heading && "mt-3")}>
                {column.entries.map((entry) => {
                  const body = (
                    <>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-14 font-semibold text-topbar-ink">
                        {entry.label}
                        <MenuBadge label={entry.badge} tone={entry.badgeTone} />
                      </span>
                      {entry.summary && (
                        <span className="mt-1 line-clamp-3 block text-13 leading-[1.5] text-topbar-muted">{entry.summary}</span>
                      )}
                    </>
                  );

                  return (
                    <li key={navKey(entry)}>
                      {entry.href === null ? (
                        <div className="-mx-2 px-2 py-2">{body}</div>
                      ) : (
                        <Link
                          href={entry.href}
                          {...newTabAttrs(entry.newTab)}
                          className="-mx-2 block rounded-md px-2 py-2 transition-colors duration-(--duration-base) hover:bg-topbar-2"
                        >
                          {body}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
