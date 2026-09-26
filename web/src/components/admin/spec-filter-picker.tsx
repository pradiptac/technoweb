"use client";

import { useState } from "react";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import type { AdminSpecLabel } from "@/types/store-merch";

/**
 * Which specification labels a store category offers as filters, and in what
 * order (2026-09-26, `docs/store.md` "Specification filters").
 *
 * **Chosen from what the products carry, never typed.** The offer is every
 * label the category's published products have on their spec sheets or their
 * variations' options, with how many carry it — so "Ports" on 14 of 15 is a
 * good filter and "Fan noise" on one is not, and the editor can see which is
 * which. A label typed by hand would be a heading over nothing the first time
 * it was misspelt; the API refuses one no product carries.
 *
 * A chosen label that nothing carries any more is listed at 0 so it can be
 * taken off; the API keeps it saveable meanwhile, so an unrelated edit is
 * never refused over it.
 *
 * Posted as one hidden JSON list, `filter_specs`, replaced wholesale.
 */
export function SpecFilterPicker({
  labels, defaultValue, editing, error,
}: {
  labels: AdminSpecLabel[];
  defaultValue: string[];
  /** A new category has no products yet, so there is nothing to offer. */
  editing: boolean;
  error?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(defaultValue);
  const count = new Map(labels.map((l) => [l.key, l.products] as const));
  const keyOf = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();
  const offered = labels.filter((l) => !chosen.some((c) => keyOf(c) === l.key));

  const move = (i: number, by: -1 | 1) =>
    setChosen((list) => {
      const to = i + by;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">Specification filters</span>
      <p className="measure mb-3 text-12-5 text-muted">
        The checkbox groups shown beside this category&apos;s products in the shop — each a label from the
        products&apos; spec sheets and variation options, with a count of every value under it. Shown in this
        order. A label most products carry makes a good filter; one only a single product has does not.
      </p>

      <input type="hidden" name="filter_specs" value={JSON.stringify(chosen)} />

      {chosen.length > 0 ? (
        <ol className="mb-4 grid gap-2">
          {chosen.map((label, i) => (
            <li key={keyOf(label)} className="flex items-center gap-3 rounded-md border border-line-strong bg-card px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-13-5 font-medium">{label}</span>
              <span className="shrink-0 text-12 text-muted tabular-nums">
                {count.get(keyOf(label)) ?? 0} product{(count.get(keyOf(label)) ?? 0) === 1 ? "" : "s"}
              </span>
              <ReorderButtons
                index={i}
                count={chosen.length}
                subject={`the ${label} filter`}
                onMove={(d) => move(i, d)}
                onRemove={() => setChosen((list) => list.filter((_, n) => n !== i))}
                dense
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-4 text-12-5 text-muted">No filters: the category&apos;s products are listed without a filter panel.</p>
      )}

      {offered.length > 0 ? (
        <>
          <span className="mb-2 block text-12-5 font-semibold text-muted">Add a filter</span>
          <ul className="flex flex-wrap gap-2">
            {offered.map((l) => (
              <li key={l.key}>
                <button
                  type="button"
                  onClick={() => setChosen((list) => [...list, l.label])}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-12-5 text-ink transition-colors duration-(--duration-base) hover:border-brand-ink"
                >
                  <span aria-hidden>+</span> {l.label}
                  <span className="text-muted tabular-nums">{l.products}</span>
                  <span className="sr-only"> products carry it</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-12-5 text-muted">
          {editing
            ? chosen.length
              ? "Every label the products carry is already a filter."
              : "No published product in this category has a specification yet. Add spec rows or variation options to its products first."
            : "Save the category and put products in it first; the labels on their spec sheets are what can be offered."}
        </p>
      )}

      {error && <p className="mt-2 text-12 text-err">{error}</p>}
    </div>
  );
}
