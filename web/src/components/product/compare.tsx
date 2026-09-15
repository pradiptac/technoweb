"use client";

import Link from "next/link";
import { IconClose } from "@/components/icons-ui";
import { COMPARE_MAX, clearCompare, compareHref, toggleCompare, useCompare } from "@/lib/compare";
import { cn } from "@/lib/utils";

/**
 * The "Compare" tick on a catalogue card.
 *
 * Outside the card's `<Link>`, deliberately — a link card must hold no other
 * interactive element — so the grid positions it over the tile's corner
 * from the `<li>`. A real checkbox, labelled by the product's name, so the
 * keyboard and a screen reader get the same control the pointer does. Full
 * tray: the unticked boxes disable and say so in their title, rather than
 * silently refusing.
 */
export function CompareToggle({ slug, name }: { slug: string; name: string }) {
  const items = useCompare();
  const on = items.some((i) => i.slug === slug);
  const full = !on && items.length >= COMPARE_MAX;

  return (
    <label
      className={cn(
        "absolute top-2.5 right-2.5 z-10 flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-12 font-semibold shadow-1 backdrop-blur-[4px] transition-colors",
        on ? "border-brand-600 bg-brand-600 text-brand-on" : "border-line-strong bg-card/95 text-muted hover:border-brand-600 hover:text-ink",
        full && "cursor-not-allowed opacity-60",
      )}
      title={full ? `The tray holds ${COMPARE_MAX}. Remove one to add another.` : undefined}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={full}
        onChange={() => toggleCompare({ slug, name })}
        className="size-3.5 accent-brand-600"
        aria-label={`Compare ${name}`}
      />
      Compare
    </label>
  );
}

/**
 * The tray: what is ticked, pinned to the bottom of the catalogue while
 * anything is. "Compare" is live from two — one product compared with
 * nothing is a product page. Each chip removes its own; Clear empties it.
 * Nothing on the server: the tray is drawn after mount from
 * `sessionStorage`, so a cached catalogue page stays one page for everyone.
 */
export function CompareTray() {
  const items = useCompare();
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4" data-compare-tray>
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-card px-3 py-2 shadow-float">
        <span className="text-12-5 font-semibold text-muted">Comparing {items.length} of {COMPARE_MAX}</span>
        <ul className="flex min-w-0 flex-wrap gap-1.5">
          {items.map((i) => (
            <li key={i.slug} className="flex min-w-0 items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-12-5">
              <span className="max-w-[18ch] truncate">{i.name}</span>
              <button
                type="button"
                onClick={() => toggleCompare(i)}
                aria-label={`Remove ${i.name} from the comparison`}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-card hover:text-ink"
              >
                <IconClose className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        {items.length >= 2 ? (
          <Link href={compareHref(items)} className="rounded-md bg-brand-600 px-3 py-1.5 text-13 font-semibold text-brand-on hover:bg-brand-700">
            Compare →
          </Link>
        ) : (
          <span className="text-12 text-faint">Tick one more to compare</span>
        )}
        <button type="button" onClick={clearCompare} className="rounded px-2 py-1.5 text-12-5 font-medium text-muted underline-offset-2 hover:underline">
          Clear
        </button>
      </div>
    </div>
  );
}
