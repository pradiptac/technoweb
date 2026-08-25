"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <form
      role="search"
      action={action}
      method="get"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="mb-7 flex flex-wrap items-end gap-2.5 rounded-lg border border-line-strong bg-surface p-3.5"
    >
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor="cat-q" className="mb-1 block text-[12px] font-semibold text-muted">
          Search
        </label>
        <Input
          id="cat-q"
          name="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Model or part number, e.g. CBS350"
          className="w-full"
        />
      </div>

      {brands.length > 0 && (
        <div className="basis-40">
          <label htmlFor="cat-brand" className="mb-1 block text-[12px] font-semibold text-muted">
            Brand
          </label>
          <Select
            id="cat-brand"
            name="brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="w-full"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>{b.name}</option>
            ))}
          </Select>
        </div>
      )}

      <div className="basis-40">
        <label htmlFor="cat-sort" className="mb-1 block text-[12px] font-semibold text-muted">
          Sort
        </label>
        <Select
          id="cat-sort"
          name="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="w-full"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>

      <Button type="submit">Apply</Button>

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
    </form>
  );
}
