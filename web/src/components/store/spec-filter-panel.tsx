import Link from "next/link";
import { AutoApplyForm } from "@/components/ui/auto-apply-form";
import { IconCheck, IconClose } from "@/components/icons-ui";
import { SpecFilterDisclosure } from "@/components/store/spec-filter-disclosure";
import { specKey, storeHref, toggleSpec, type SpecSelection } from "@/lib/store-specs";
import { cn } from "@/lib/utils";
import type { StoreFacet } from "@/types/store-merch";

type Base = { q?: string; category: string; sort?: string };

/**
 * The shop's specification filters: a checkbox group per label with how many
 * products each value leaves (2026-09-26, `docs/store.md`).
 *
 * **Two modes, because two pages can and cannot read the query.**
 *
 * - `form` on `/store`, which is dynamic already: a GET form through
 *   `AutoApplyForm`, so a tick applies at once and the address it pushes is
 *   the one the form would have submitted. The rest of the query rides along
 *   as hidden inputs, and each checkbox is named `spec[Label][i]` — indexed,
 *   so every pair is its own key (see `lib/store-specs.ts`).
 * - `links` on `/store/categories/[slug]`, which is ISR-cached and must not
 *   read `searchParams` — a request-time API in that render is a 500, not a
 *   fallback. Its panel is built from the unfiltered counts and every value
 *   is a link to `/store` with the category and that value, so the first
 *   tick leaves the cached page for the one that can filter. `nofollow`
 *   and no prefetch: a filtered view is `noindex`, and forty prefetched
 *   dynamic renders per category page is forty renders nobody asked for.
 *
 * A value that would leave nothing is shown and disabled rather than hidden,
 * unless it is ticked — then it stays pressable so it can be unticked.
 */
export function SpecFilterPanel({
  facets, selection, base, mode, className,
}: {
  facets: StoreFacet[];
  selection: SpecSelection;
  base: Base;
  mode: "form" | "links";
  className?: string;
}) {
  if (facets.length === 0) return null;

  const chosen = Object.values(selection).reduce((n, v) => n + v.length, 0);

  const groups = facets.map((facet, f) => (
    <fieldset key={facet.key} className="min-w-0 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-13-5 font-semibold text-ink">{facet.label}</legend>
      <ul className="grid gap-0.5">
        {facet.values.map((v, i) => {
          const dead = v.count === 0 && !v.selected;
          const row = "flex min-h-8 items-center gap-2.5 rounded-md px-1.5 text-13-5";

          if (mode === "links") {
            return (
              <li key={v.key}>
                {dead ? (
                  <span className={cn(row, "text-muted")}>
                    <Box checked={false} />
                    <span className="min-w-0 flex-1 truncate">{v.value}</span>
                    <Count n={v.count} />
                  </span>
                ) : (
                  <Link
                    href={storeHref(base, toggleSpec(selection, facet.label, v.value))}
                    rel="nofollow"
                    prefetch={false}
                    className={cn(row, "text-ink hover:bg-surface-2")}
                  >
                    <Box checked={v.selected} />
                    <span className="min-w-0 flex-1 truncate">
                      {v.value}
                      {v.selected && <span className="sr-only"> (chosen)</span>}
                    </span>
                    <Count n={v.count} />
                  </Link>
                )}
              </li>
            );
          }

          const id = `spec-${f}-${i}`;
          return (
            <li key={v.key}>
              <label htmlFor={id} className={cn(row, dead ? "text-muted" : "cursor-pointer text-ink hover:bg-surface-2")}>
                <input
                  id={id}
                  type="checkbox"
                  name={`spec[${facet.label}][${i}]`}
                  value={v.value}
                  defaultChecked={v.selected}
                  disabled={dead}
                  className="size-4 shrink-0 accent-brand-600"
                />
                <span className="min-w-0 flex-1 truncate">{v.value}</span>
                <Count n={v.count} />
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  ));

  return (
    <SpecFilterDisclosure selected={chosen} className={className}>
      <section aria-labelledby="spec-filter-heading" className="rounded-xl border border-line-strong bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="spec-filter-heading" className="text-15 font-semibold text-ink">Filter</h2>
          {chosen > 0 && (
            <Link
              href={storeHref(base, {})}
              className="text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline"
            >
              Clear all
            </Link>
          )}
        </div>

        {mode === "form" ? (
          <AutoApplyForm action="/store" aria-label="Filter by specification" className="grid gap-3">
            {base.q && <input type="hidden" name="q" value={base.q} />}
            <input type="hidden" name="category" value={base.category} />
            {base.sort && <input type="hidden" name="sort" value={base.sort} />}
            {groups}
            {/* Without JavaScript the form is a plain GET, and needs a button. */}
            <button type="submit" className="sr-only focus:not-sr-only focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-13 focus:text-brand-on">
              Apply filters
            </button>
          </AutoApplyForm>
        ) : (
          <div className="grid gap-3">{groups}</div>
        )}
      </section>
    </SpecFilterDisclosure>
  );
}

/**
 * What is ticked, as chips that each take one value off, and "Clear all".
 * Above the grid, so a filtered listing says why it is short.
 */
export function SpecFilterChips({
  selection, base, className,
}: {
  selection: SpecSelection;
  base: Base;
  className?: string;
}) {
  const chips = Object.entries(selection).flatMap(([label, values]) =>
    values.map((value) => ({ label, value })),
  );

  if (chips.length === 0) return null;

  return (
    <ul aria-label="Chosen filters" className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map(({ label, value }) => (
        <li key={`${specKey(label)}:${specKey(value)}`}>
          <Link
            href={storeHref(base, toggleSpec(selection, label, value))}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-brand-ink/30 bg-card px-3 text-12-5 text-ink hover:border-brand-ink"
          >
            <span className="text-muted">{label}:</span> {value}
            <IconClose aria-hidden className="size-3.5 text-muted" />
            <span className="sr-only">(remove this filter)</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={storeHref(base, {})} className="inline-flex min-h-8 items-center px-1 text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
          Clear all
        </Link>
      </li>
    </ul>
  );
}

function Count({ n }: { n: number }) {
  return <span className="shrink-0 text-12 text-muted tabular-nums">{n}</span>;
}

/** The link mode's checkbox, drawn — a link cannot hold an `<input>`. */
function Box({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[3px] border",
        checked ? "border-brand-600 bg-brand-600 text-brand-on" : "border-line-strong bg-card",
      )}
    >
      {checked && <IconCheck className="size-3" />}
    </span>
  );
}
