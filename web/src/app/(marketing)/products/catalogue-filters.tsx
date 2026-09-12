"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/input";
import { IconSearch } from "@/components/icons";
import type { Brand } from "@/types/api";

const SORTS = [
  { value: "featured", label: "Featured first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Newest first" },
] as const;

/**
 * Search, brand and sort for the catalogue — used by /products and by every
 * category listing, which differ only in the path they submit to.
 *
 * A plain GET navigation, like the knowledge-base search: results stay
 * server-rendered, a filtered view is a shareable URL, and the whole thing
 * works with JavaScript off. The onSubmit handler is a router.push of the
 * same URL the form would have produced, so the two paths cannot disagree.
 *
 * `page` is dropped on submit. Filtering while on page 3 of an unfiltered
 * list would otherwise ask for page 3 of a two-page result and land on an
 * empty screen that looks like "nothing matched".
 *
 * **It is sized to match the store's own filter bar, deliberately.** The two
 * are the same instrument on two catalogues, and they were three different
 * control heights apart: the shared `Input`/`Select` primitives resolve to
 * about 45px from their padding while `Button` is 38px, which on one row
 * reads as three unrelated controls that happen to be adjacent. Everything
 * here is `h-11`, which is the store bar's height and the 44px the mobile
 * audit wants of a tap target anyway.
 *
 * The count sits in its own `h-11` box for the same reason. It used to be a
 * bare `<p>` in an `items-end` row, so its single line of text was aligned to
 * the *bottom* of a 45px control — a stranded caption hanging below the
 * button, which is what it looked like and not what it was.
 */
export function CatalogueFilters({
  action, brands, total,
}: {
  action: string;
  brands: Brand[];
  /** Result count. Rendered here so the filters and their outcome sit together. */
  total: number;
}) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [brand, setBrand] = useState(params.get("brand") ?? "");
  const [sort, setSort] = useState(params.get("sort") ?? "featured");
  const router = useRouter();

  const active = Boolean(params.get("q") || params.get("brand") || (params.get("sort") ?? "featured") !== "featured");

  const submit = () => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (brand) next.set("brand", brand);
    if (sort && sort !== "featured") next.set("sort", sort);
    const qs = next.toString();
    router.push(qs ? `${action}?${qs}` : action);
  };

  return (
    /*
      A grid on a phone and a flex row above `lg`, the arrangement the store
      bar arrived at: the two are genuinely different layouts rather than one
      reflowing, and a wrapping flex row needs basis arithmetic at three
      breakpoints and still strands the button on a line of its own.
    */
    <form
      role="search"
      action={action}
      method="get"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="mb-7 grid grid-cols-2 gap-3 rounded-xl border border-line-strong bg-card p-3 shadow-1 lg:flex lg:items-end lg:gap-3"
    >
      <div className="col-span-2 min-w-0 lg:flex-1">
        {/*
          `sr-only`, not deleted. The magnifier and the placeholder are enough
          to look at and are nothing to a screen reader — a placeholder is not
          a label, and an input labelled only by one is announced as "edit
          text, blank".
        */}
        <label htmlFor="cat-q" className="sr-only">Search the catalogue</label>
        <div className="relative">
          {/*
            The glyph is inside the field so it reads as part of the control.
            `pointer-events-none`, or it eats the click that should focus it.
          */}
          <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-faint">
            <IconSearch className="size-[18px]" />
          </span>
          <input
            id="cat-q"
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Model or part number, e.g. CBS350"
            className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-11 pr-3 text-[14.5px] transition-all duration-200 ease-brand placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
          />
        </div>
      </div>

      {brands.length > 0 && (
        <div className="min-w-0 lg:w-[184px]">
          <label htmlFor="cat-brand" className="mb-1 block text-[12px] font-semibold uppercase tracking-[.04em] text-faint">
            Brand
          </label>
          <Select
            id="cat-brand"
            name="brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="h-11 rounded-lg bg-surface py-0 text-[14.5px]"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>{b.name}</option>
            ))}
          </Select>
        </div>
      )}

      <div className="min-w-0 lg:w-[184px]">
        <label htmlFor="cat-sort" className="mb-1 block text-[12px] font-semibold uppercase tracking-[.04em] text-faint">
          Sort
        </label>
        <Select
          id="cat-sort"
          name="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-11 rounded-lg bg-surface py-0 text-[14.5px]"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>

      {/*
        The button and the count share a row on a phone and sit at the end of
        the strip on a wide screen — `col-span-2` so they keep the full width
        when the two selects are side by side above them.
      */}
      <div className="col-span-2 flex h-11 items-center gap-3 lg:col-span-1">
        <button
          type="submit"
          className="h-11 shrink-0 rounded-lg bg-brand-600 px-6 text-[14px] font-semibold text-brand-on transition-colors duration-200 hover:bg-brand-700"
        >
          Apply
        </button>

        <p className="ml-auto text-[13px] text-muted" aria-live="polite">
          {total === 1 ? "1 product" : `${total} products`}
          {active && (
            <>
              {" · "}
              <a href={action} className="font-semibold text-brand-ink underline underline-offset-2">
                Clear
              </a>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
