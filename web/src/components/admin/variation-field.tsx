"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/money";
import type { AdminProductVariation } from "@/types/api";

const MAX = 50;
const MAX_OPTIONS = 6;

type Row = {
  id?: number;
  name: string;
  sku: string;
  /** Ordered pairs, because the order is the order of the selectors. */
  options: [string, string][];
  price: string;
  stock: string;
  /** Sell this row when the shelf is empty. Off unless somebody says otherwise. */
  allow_oversell: boolean;
  is_active: boolean;
};

/**
 * The buyable configurations of a product.
 *
 * A flat list, each row carrying its own options — see the migration for why
 * this is not a matrix of dimensions. The short version: a matrix generates a
 * cell for every combination and most of them are hardware nobody stocks.
 *
 * **A row's `id` is submitted and matters.** An order item references the
 * variation it was bought as, so the API updates the row rather than deleting
 * and recreating it; dropping the id here would renumber every variation on
 * each save and silently re-point historical orders.
 *
 * Option *names* come with a datalist built from the names already used on this
 * product, so the second variation offers "RAM" rather than inviting somebody
 * to type "Ram" and produce two selectors for one thing.
 */
export function VariationField({
  defaultValue, error, productPricePaise, onCountChange,
}: {
  defaultValue: AdminProductVariation[];
  error?: string;
  productPricePaise?: number | null;
  /**
   * How many rows there are now.
   *
   * The product's own Stock field is dead once there is a variation — stock is
   * counted per row from then on — so the form has to disable it, and it can
   * only know to when this says so. Called from the add and remove handlers
   * rather than from an effect on `rows`: seeding a parent's state from a
   * child's effect is a cascading render, which `react-hooks/set-state-in-effect`
   * refuses outright.
   */
  onCountChange?: (count: number) => void;
}) {
  const listId = useId();

  const [rows, setRows] = useState<Row[]>(
    defaultValue.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? "",
      options: Object.entries(v.options ?? {}) as [string, string][],
      price: paiseToRupeeInput(v.price_paise),
      stock: String(v.stock ?? 0),
      allow_oversell: v.allow_oversell ?? false,
      is_active: v.is_active,
    })),
  );

  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  const setOption = (i: number, o: number, key: 0 | 1, value: string) =>
    setRows((r) => r.map((row, n) => n !== i ? row : {
      ...row,
      options: row.options.map((pair, m) => {
        if (m !== o) return pair;
        const next: [string, string] = [...pair];
        next[key] = value;
        return next;
      }),
    }));

  /*
    Only complete rows are submitted, and an incomplete one is simply dropped
    rather than refused. A repeater always has a half-typed row in it when
    somebody presses Save, and a 422 naming "variations.3.name" for a line they
    had abandoned is a form arguing with its own affordance.
  */
  const payload = rows
    .filter((r) => r.name.trim() !== "")
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name.trim(),
      sku: r.sku.trim() || null,
      options: Object.fromEntries(
        r.options
          .map(([k, v]) => [k.trim(), v.trim()] as [string, string])
          .filter(([k, v]) => k !== "" && v !== ""),
      ),
      price_paise: rupeesToPaise(r.price),
      stock: Number(r.stock) || 0,
      allow_oversell: r.allow_oversell,
      is_active: r.is_active,
    }));

  const names = Array.from(new Set(rows.flatMap((r) => r.options.map(([k]) => k.trim()).filter(Boolean))));

  return (
    <section className="mt-2 rounded-lg border border-line-strong bg-card p-5">
      <span className="block text-[14.5px] font-semibold">Variations</span>
      <p className="measure mt-0.5 mb-4 text-[13px] text-muted">
        One row per thing somebody can actually buy — 24-port and 48-port, not
        every combination of every option. Leave this empty for a product that
        comes one way. A row with no price is sold at the product&rsquo;s price.
      </p>

      <input type="hidden" name="variations" value={JSON.stringify(payload)} />

      <datalist id={listId}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>

      <ul className="grid gap-4">
        {rows.map((row, i) => (
          <li key={row.id ?? `new-${i}`} className="rounded border border-line-strong p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                Variation {i + 1}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    onChange={(e) => set(i, { is_active: e.target.checked })}
                  />
                  For sale
                </label>
                {/*
                  Per row, because that is where the stock is. A product with
                  variations counts per variation, so "the 24-port is
                  back-ordered and the 48-port is not" is the ordinary case and
                  a single switch on the product could not say it. The title
                  carries the consequence: the level goes negative, which is
                  the honest record of owing somebody one.
                */}
                <label
                  className="flex items-center gap-1.5 text-[12.5px] text-muted"
                  title="Take orders for this row when the shelf is empty. Stock goes below zero, which is what the shop owes."
                >
                  <input
                    type="checkbox"
                    checked={row.allow_oversell}
                    onChange={(e) => set(i, { allow_oversell: e.target.checked })}
                  />
                  Back-order
                </label>
                <button
                  type="button"
                  onClick={() => setRows((r) => {
                    const next = r.filter((_, n) => n !== i);
                    onCountChange?.(next.length);
                    return next;
                  })}
                  className="text-[12.5px] font-semibold text-muted hover:text-ink"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
              <Input
                aria-label={`Variation ${i + 1} name`}
                placeholder="48-Port"
                value={row.name}
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <Input
                aria-label={`Variation ${i + 1} SKU`}
                placeholder="SKU (optional)"
                value={row.sku}
                className="font-mono text-[14px]"
                onChange={(e) => set(i, { sku: e.target.value })}
              />
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr]">
              <Input
                aria-label={`Variation ${i + 1} price in rupees`}
                inputMode="decimal"
                placeholder={
                  productPricePaise
                    ? `Price — blank means ${paiseToRupeeInput(productPricePaise)}`
                    : "Price in rupees"
                }
                value={row.price}
                onChange={(e) => set(i, { price: e.target.value })}
              />
              <Input
                aria-label={`Variation ${i + 1} stock`}
                type="number"
                min={0}
                placeholder="Stock"
                value={row.stock}
                onChange={(e) => set(i, { stock: e.target.value })}
              />
            </div>

            {row.options.length > 0 && (
              <ul className="mt-2 grid gap-2">
                {row.options.map(([key, value], o) => (
                  <li key={o} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      aria-label={`Variation ${i + 1} option ${o + 1} name`}
                      list={listId}
                      placeholder="RAM"
                      value={key}
                      onChange={(e) => setOption(i, o, 0, e.target.value)}
                    />
                    <Input
                      aria-label={`Variation ${i + 1} option ${o + 1} value`}
                      placeholder="16 GB"
                      value={value}
                      onChange={(e) => setOption(i, o, 1, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => set(i, { options: row.options.filter((_, m) => m !== o) })}
                      className="px-2 text-[12.5px] font-semibold text-muted hover:text-ink"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {row.options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={() => set(i, { options: [...row.options, ["", ""]] })}
                className="mt-2 text-[12.5px] font-semibold text-brand-ink hover:underline"
              >
                Add an option
              </button>
            )}
          </li>
        ))}
      </ul>

      {rows.length < MAX && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3.5"
          onClick={() => setRows((r) => {
            onCountChange?.(r.length + 1);
            return [...r, {
                name: "", sku: "", options: [], price: "", stock: "0",
              allow_oversell: false, is_active: true,
            }];
          })}
        >
          Add variation
        </Button>
      )}

      {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
    </section>
  );
}
