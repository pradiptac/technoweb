"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { IconSliders } from "@/components/icons-ui";
import { parseHidden, screenKey, setDensity, setHiddenColumns, useDensity, useHiddenColumnsRaw, type Density } from "@/lib/table-view";
import { cn } from "@/lib/utils";

/**
 * "Table view": row density for the whole console, and which columns of the
 * screen in front of you are shown (0.119.0).
 *
 * **One control in the header, and no list screen knows it exists.** There are
 * some seventy hand-written `.admin-table`s; a chooser built into each would
 * be seventy edits and the seventy-first screen would forget. So this reads
 * the page instead: the headings of the one table in `<main>`, through a
 * `MutationObserver` behind `useSyncExternalStore` — a DOM read is exactly
 * what that hook is for, and an effect that set state from it is what the
 * lint rule refuses. What it writes back is CSS and nothing else: a `<style>`
 * of `nth-child` rules. No table's markup is touched, so there is nothing for
 * React to disagree with when the page re-renders or streams in.
 *
 * Hidden columns are remembered **by heading, per screen** (`screenKey`), not
 * by position — a column added in a later release must not silently hide its
 * neighbour. A heading that is no longer on the table simply matches nothing.
 *
 * Three things are never offered: the first column (it is the row's identity
 * and the card's heading on a phone), a column with no heading, and the
 * actions column. And all of it applies from `md` up only — below that a row
 * is a card of labelled lines, where "hide a column" would mean a detail
 * missing with no header row to show that anything is.
 *
 * It also says whether the tables **fit**: the sticky header in `globals.css`
 * has to turn each wrapper's `overflow-x: auto` into `clip`, and a clipped
 * wrapper cannot be scrolled sideways, so the rule applies only while the
 * `[data-table-fits]` marker below is rendered. Neither width it compares
 * changes when the rule switches, so the answer cannot flip itself.
 */

const NEVER = /^(actions?|manage)$/i;

/** A string, because `useSyncExternalStore` compares snapshots by identity. */
function readTables(): string {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>("main table.admin-table"));
  if (tables.length === 0) return "";

  // A pixel of slack: both figures are rounded, and not the same way.
  const fits = tables.every((table) => !table.parentElement || table.offsetWidth <= table.parentElement.clientWidth + 1);
  // Two tables share one set of nth-child rules and not one set of columns.
  const labels = tables.length > 1 ? null : Array.from(tables[0].querySelectorAll("thead th"), (th) =>
    (th.textContent ?? "").replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim());

  return JSON.stringify({ fits, labels });
}

function subscribeTables(listener: () => void) {
  let frame = 0;
  // The page under the header changes on every navigation and every stream;
  // one read per frame is plenty.
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(listener);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Whether a table fits its wrapper is a fact about the window too.
  window.addEventListener("resize", listener);

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", listener);
    cancelAnimationFrame(frame);
  };
}

const DENSITIES: { value: Density; label: string; blurb: string }[] = [
  { value: "comfortable", label: "Comfortable", blurb: "Room around every row." },
  { value: "compact", label: "Compact", blurb: "Tighter rows, more of them on screen." },
];

export function TableView() {
  const pathname = usePathname();
  const key = screenKey(pathname);
  const density = useDensity();
  const found = useSyncExternalStore(subscribeTables, readTables, () => "");
  const raw = useHiddenColumnsRaw(key);
  const [open, setOpen] = useState(false);

  const { fits, many, labels } = useMemo(() => {
    const none = { fits: false, many: false, labels: [] as string[] };
    if (!found) return none;
    try {
      const parsed = JSON.parse(found) as { fits?: unknown; labels?: unknown };
      return {
        fits: parsed.fits === true,
        many: parsed.labels === null,
        labels: Array.isArray(parsed.labels) ? parsed.labels.map(String) : [],
      };
    } catch {
      return none;
    }
  }, [found]);
  const hidden = useMemo(() => parseHidden(raw), [raw]);

  const offered = labels
    .map((label, index) => ({ label, index }))
    .filter(({ label, index }) => index > 0 && label !== "" && !NEVER.test(label));
  const off = offered.filter(({ label }) => hidden.includes(label));

  // Nothing to adjust on a screen with no table.
  if (!found) return null;

  const css = off.length
    ? `@media (width >= 48rem) { ${off.map(({ index }) => `main table.admin-table :is(th, td):nth-child(${index + 1})`).join(", ")} { display: none; } }`
    : "";

  const toggle = (label: string, show: boolean) =>
    setHiddenColumns(key, show ? hidden.filter((h) => h !== label) : [...hidden.filter((h) => h !== label), label]);

  return (
    <>
      {css && <style>{css}</style>}
      {fits && <span hidden data-table-fits />}

      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Table view"
        className="relative hidden size-8 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink md:grid"
      >
        <IconSliders className="size-4" />
        <span className="sr-only">Table view{off.length ? ` — ${off.length} ${off.length === 1 ? "column" : "columns"} hidden` : ""}</span>
        {off.length > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-brand-600" />}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Table view"
        description="How the lists in the console are drawn for you, in this browser."
        footer={<Button type="button" onClick={() => setOpen(false)}>Done</Button>}
      >
        <fieldset className="mb-6 min-w-0">
          <legend className="mb-2 text-13-5 font-semibold">Row spacing</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DENSITIES.map((d) => (
              <label
                key={d.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-13-5",
                  density === d.value ? "border-brand-600 bg-brand-50" : "border-line-strong bg-card",
                )}
              >
                <input
                  type="radio" name="console-density" value={d.value}
                  checked={density === d.value} onChange={() => setDensity(d.value)}
                  className="mt-0.5 size-4 shrink-0 accent-brand-600"
                />
                <span>
                  <span className="block font-semibold text-ink">{d.label}</span>
                  <span className="block text-12-5 text-muted">{d.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-12-5 text-muted">Applies to every list in the console.</p>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-2 text-13-5 font-semibold">Columns on this screen</legend>
          {many ? (
            <p className="text-13 text-muted">This screen has more than one table, so its columns cannot be chosen here.</p>
          ) : offered.length === 0 ? (
            <p className="text-13 text-muted">This table has no columns that can be put away.</p>
          ) : (
            <>
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {offered.map(({ label }) => (
                  <li key={label}>
                    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-13-5">
                      <input
                        type="checkbox" checked={!hidden.includes(label)}
                        onChange={(e) => toggle(label, e.target.checked)}
                        className="size-4 shrink-0 accent-brand-600"
                      />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-12-5 text-muted">
                  The first column and the row&rsquo;s actions always stay. On a phone every detail is shown.
                </p>
                {off.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setHiddenColumns(key, [])}>
                    Show all columns
                  </Button>
                )}
              </div>
            </>
          )}
        </fieldset>
      </Modal>
    </>
  );
}
