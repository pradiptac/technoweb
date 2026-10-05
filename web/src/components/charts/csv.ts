/**
 * A chart's numbers as a CSV the browser saves — the "export" every chart in
 * the kit offers, built from the data the chart already holds rather than by
 * asking the API again.
 *
 * Cells that begin `=`, `+`, `-` or `@` are prefixed with an apostrophe:
 * Excel runs those as formulas, and a category an editor typed is not
 * somebody else's to execute. The API's `Csv::escape()` makes the same
 * decision for the exports it writes. Money is never in here — these are
 * counts — so a plain number stays a plain number.
 */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null): string => {
    if (v === null) return "";
    if (typeof v === "number") return String(v);
    const guarded = /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Hands the browser a file. Only ever called from a click. */
export function downloadCsv(filename: string, csv: string): void {
  // The byte-order mark is what makes Excel read the file as UTF-8, so "₹"
  // and "–" survive a double-click.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
