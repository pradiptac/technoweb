"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select, Alert } from "@/components/ui/input";
import { FileDrop } from "@/components/ui/file-drop";
import { Count } from "@/app/admin/(app)/newsletter/subscribers/import/count";
import { analyseStoreImportAction, runStoreImportAction } from "../../actions";
import type { StoreImportAnalysis, StoreImportProblem, StoreImportResult } from "@/types/api";

/**
 * Choose, map, import — three screens for the catalogue import, the shape
 * the newsletter's subscriber wizard has and for the same reason: only two
 * steps touch the server, and the mapping screen is where somebody actually
 * decides something.
 *
 * **The dry run writes nothing.** The counts under the mapping are what
 * *would* happen — change a column and they change with it — because the
 * moment somebody notices they mapped the cost column onto the price must
 * come before two hundred prices go live, not after.
 *
 * The column list comes from the analysis (`fields`), sent by the API rather
 * than listed here, so a column added to the export appears in the mapping
 * without this file changing. The wording per field is the one thing kept
 * on this side, because it is about the screen.
 */

const FIELD_COPY: Record<string, { label: string; hint?: string }> = {
  sku: { label: "SKU", hint: "How a row is matched. Blank with a name and a price creates a product." },
  parent_sku: { label: "Parent SKU", hint: "Filled on a variation's row. The import never creates a variation." },
  name: { label: "Name", hint: "Required for a new product." },
  slug: { label: "Slug", hint: "New products only; derived from the name when blank." },
  type: { label: "Type", hint: "physical, digital or service. New products default to physical." },
  category: { label: "Category", hint: "The category's slug. An unknown one refuses the row." },
  brand: { label: "Brand", hint: "The brand's slug. An unknown one refuses the row." },
  price: { label: "Price", hint: "Rupees as a plain number, like 1179.00. Required for a new product." },
  compare_at: { label: "Compare-at price", hint: "The struck-through “was” price, in rupees." },
  stock: { label: "Stock", hint: "The level on the shelf. A change is recorded in the stock ledger." },
  track_stock: { label: "Track stock", hint: "1 or 0." },
  allow_oversell: { label: "Allow oversell", hint: "1 or 0." },
  gtin: { label: "GTIN", hint: "The barcode: 8, 12, 13 or 14 digits." },
  mpn: { label: "MPN", hint: "The manufacturer's part number — never the SKU." },
  condition: { label: "Condition", hint: "new, refurbished or used." },
  weight_grams: { label: "Weight (grams)" },
  status: { label: "Status", hint: "draft, published or archived. New products default to draft." },
  feed_include: { label: "In the Google feed", hint: "1 or 0." },
  short_description: { label: "Short description" },
};

const OUTCOME_LABEL: Record<string, string> = {
  create: "New product",
  update_product: "Updates a product",
  update_variation: "Updates a variation",
  invalid: "Skipped",
};

export function StoreImportWizard() {
  const [analysis, setAnalysis] = useState<StoreImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<StoreImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  /**
   * The dry run, on the file first chosen and again whenever a column is
   * re-mapped — the counts have to describe the mapping on screen, and the
   * only thing that can produce them is the server reading the file under
   * it. The file is kept in state so a re-analysis needs no second choice.
   */
  const analyse = async (chosen: File, withMapping?: Record<string, number | null>) => {
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append("file", chosen);
    if (withMapping) {
      for (const [field, index] of Object.entries(withMapping)) {
        form.append(`mapping[${field}]`, index === null ? "" : String(index));
      }
    }

    const outcome = await analyseStoreImportAction(form);
    setBusy(false);

    if (outcome.error || !outcome.analysis) {
      setError(outcome.error ?? "That file could not be read.");
      return;
    }

    setFile(chosen);
    setAnalysis(outcome.analysis);
    setMapping(outcome.analysis.mapping);
  };

  const remap = (field: string, value: string) => {
    const next = { ...mapping, [field]: value === "" ? null : Number(value) };
    setMapping(next);
    if (file) void analyse(file, next);
  };

  const run = async () => {
    if (!analysis) return;

    setBusy(true);
    setError(null);

    const outcome = await runStoreImportAction({
      file: analysis.file,
      original_name: analysis.original_name,
      mapping,
    });

    setBusy(false);

    if (outcome.error) setError(outcome.error);
    else setResult(outcome.result ?? null);
  };

  const reset = () => {
    setResult(null);
    setAnalysis(null);
    setFile(null);
    setError(null);
  };

  // ---------------------------------------------------------------- done
  if (result) {
    const c = result.counts;

    return (
      <div className="grid gap-4">
        <Alert tone="ok" title="Import finished">
          {c.create} created, {c.update_product + c.update_variation} updated
          {c.invalid > 0 ? `, ${c.invalid} skipped` : ""}.
        </Alert>

        <dl className="grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-13 sm:max-w-md">
          <Count label="New products" value={c.create} strong />
          <Count label="Products updated" value={c.update_product} />
          <Count label="Variations updated" value={c.update_variation} />
          <Count label="Rows skipped" value={c.invalid} />
        </dl>

        <Problems problems={result.problems} total={c.invalid} />

        <div className="flex gap-2">
          <ButtonLink href="/admin/store/products" size="sm">See the products</ButtonLink>
          <Button type="button" size="sm" variant="secondary" onClick={reset}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- mapping
  if (analysis) {
    const counts = analysis.counts;
    const nothingMapped = mapping.sku == null && mapping.name == null;
    const willWrite = counts.create + counts.update_product + counts.update_variation;

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <section>
          <h2 className="mb-1.5 text-13 font-semibold">
            {analysis.original_name}
            <span className="ml-2 font-normal text-faint">{counts.total} rows</span>
          </h2>

          <dl className="grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-13 sm:max-w-md">
            <Count label="New products" value={counts.create} strong />
            <Count label="Products updated by SKU" value={counts.update_product} />
            <Count label="Variations updated by SKU" value={counts.update_variation} />
            <Count label="Rows that will be skipped" value={counts.invalid} />
          </dl>

          <p className="measure mt-2 text-12-5 text-faint">
            Nothing has been written yet. These are the counts for the mapping below — change it
            and they change with it. A blank cell leaves that field as it is; only a filled cell
            writes.
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-13 font-semibold">Which column is which</h2>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.fields.map((field) => {
              const copy = FIELD_COPY[field] ?? { label: field };
              return (
                <Field key={field} label={copy.label} htmlFor={`map-${field}`}
                  variant="float-static" hint={copy.hint}>
                  <Select
                    id={`map-${field}`}
                    value={mapping[field] ?? ""}
                    disabled={busy}
                    onChange={(e) => remap(field, e.target.value)}
                  >
                    <option value="">Not in this file</option>
                    {analysis.headers.map((header, i) => (
                      <option key={i} value={i}>{header || `Column ${i + 1}`}</option>
                    ))}
                  </Select>
                </Field>
              );
            })}
          </div>
        </section>

        {analysis.preview.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-13 font-semibold">The first few rows, as mapped</h2>

            <div className="overflow-x-auto rounded-lg border border-line-strong">
              <table className="w-full text-12-5">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-11-5 uppercase tracking-[.04em] text-muted">
                    <th className="px-3 py-1.5 font-semibold">Line</th>
                    <th className="px-3 py-1.5 font-semibold">Outcome</th>
                    {["sku", "parent_sku", "name", "price", "stock"].map((f) => (
                      <th key={f} className="px-3 py-1.5 font-semibold">{FIELD_COPY[f]?.label ?? f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.preview.map((row) => (
                    <tr key={row.line} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 tabular-nums text-faint">{row.line}</td>
                      <td className="px-3 py-1.5">{OUTCOME_LABEL[row.outcome] ?? row.outcome}</td>
                      {["sku", "parent_sku", "name", "price", "stock"].map((f) => (
                        <td key={f} className="max-w-[22ch] truncate px-3 py-1.5">
                          {row[f] ?? <span className="text-faint">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <Problems problems={analysis.problems} total={counts.invalid} />

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="button" onClick={run} disabled={busy || nothingMapped || willWrite === 0}>
            {busy ? "Working…" : `Import ${willWrite} row${willWrite === 1 ? "" : "s"}`}
          </Button>
          <Button type="button" variant="secondary" onClick={reset} disabled={busy}>
            Choose a different file
          </Button>
        </div>

        {nothingMapped && (
          <p className="text-12-5 text-warn">
            Choose which column holds the SKU — or the name, for a file of new products — without
            one there is nothing to match on.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- choose
  return (
    <div>
      {error && <Alert tone="err" title="That file could not be read">{error}</Alert>}

      <FileDrop
        accept=".csv,.txt,.xlsx"
        onFiles={(files) => { if (files[0]) void analyse(files[0]); }}
        label={busy ? "Reading…" : "Choose a file…"}
        hint="CSV or Excel (.xlsx), with a header row. Up to 10 MB."
        disabled={busy}
      />

      <div className="measure mt-4 text-13 text-muted">
        <p className="mb-2">The export from the products list is the right shape. A file like this works:</p>
        <pre className="overflow-x-auto rounded border border-line bg-surface px-3 py-2 font-mono text-12">
{`sku,parent_sku,name,price,stock,category
SW-24,,24-port switch,11800.00,12,switches
SW-24-POE,SW-24,,14160.00,4,`}
        </pre>
        <p className="mt-2">
          Column names do not have to match — the next step lets you say which is which. A row
          whose SKU is a product&rsquo;s updates that product; one whose SKU is a variation&rsquo;s
          updates that variation; one matching nothing creates a product, which needs a name and a
          price. A blank cell leaves that field alone.
        </p>
        <p className="mt-2">
          Prices are rupees as a plain number. Categories and brands are named by slug, and an
          unknown one skips the row rather than creating anything.
        </p>
      </div>
    </div>
  );
}

/**
 * The refused lines, with the reason for each. Capped on the server at
 * fifty; the count says how many there were, because a file of five hundred
 * bad rows is a wrong mapping and the first fifty say so as well as the
 * five-hundredth.
 */
function Problems({ problems, total }: { problems: StoreImportProblem[]; total: number }) {
  if (problems.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1.5 text-13 font-semibold">
        Rows that {total > 0 && problems.length === total ? "are" : "will be"} skipped
        <span className="ml-2 font-normal text-faint">
          {total > problems.length ? `first ${problems.length} of ${total}` : total}
        </span>
      </h2>

      <ul className="grid gap-1 text-12-5">
        {problems.map((p, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 gap-y-0.5 rounded border border-line bg-surface px-3 py-1.5 sm:flex-nowrap">
            <span className="shrink-0 tabular-nums text-faint">Line {p.line}</span>
            <span className="min-w-0 shrink-0 truncate font-mono">{p.sku ?? "—"}</span>
            <span className="min-w-0 text-muted">{p.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
