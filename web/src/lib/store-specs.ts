/**
 * The shop's specification filters in the address bar (2026-09-26).
 *
 * `?spec[Ports][0]=24 ports&spec[Ports][1]=48 ports&spec[PoE][0]=Yes` — the
 * shape PHP reads as `spec => [Ports => [...], PoE => [...]]`. Indexed rather
 * than `[]`, so every pair is a distinct key: `Pagination`, the chips and the
 * filter bar's hidden inputs all carry a query as a flat `key → value` map,
 * and a repeated `spec[Ports][]` cannot be one. The API reads either form.
 *
 * Pure functions, no fetching, so a server page and a client island can both
 * import it.
 */

/** label → the values chosen under it, in the order they arrived. */
export type SpecSelection = Record<string, string[]>;

const KEY = /^spec\[(.+)\]\[(\d*)\]$/;

/** The same normalisation the API matches on: trimmed, whitespace collapsed, lower-case. */
export function specKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Read the selection out of a page's `searchParams`. */
export function parseSpecs(sp: Record<string, string | string[] | undefined>): SpecSelection {
  const out: SpecSelection = {};

  for (const [key, raw] of Object.entries(sp)) {
    const m = KEY.exec(key);
    if (!m || raw === undefined) continue;
    const label = m[1].trim();
    if (!label) continue;
    for (const v of Array.isArray(raw) ? raw : [raw]) {
      const value = v.trim();
      if (!value) continue;
      const list = (out[label] ??= []);
      if (!list.some((x) => specKey(x) === specKey(value))) list.push(value);
    }
  }

  return out;
}

/**
 * Only the labels a category offers. A `spec` left in the address from
 * another category — the filter bar carries the selection across a change of
 * category — must not narrow a listing whose panel cannot show it.
 */
export function limitSpecs(selection: SpecSelection, offered: string[]): SpecSelection {
  const keys = new Map(offered.map((l) => [specKey(l), l] as const));
  const out: SpecSelection = {};

  for (const [label, values] of Object.entries(selection)) {
    const own = keys.get(specKey(label));
    if (own && values.length) out[own] = [...(out[own] ?? []), ...values];
  }

  return out;
}

export function hasSpecs(selection: SpecSelection): boolean {
  return Object.values(selection).some((v) => v.length > 0);
}

/** The selection as flat `spec[Label][i] → value` pairs. */
export function specEntries(selection: SpecSelection): [string, string][] {
  const out: [string, string][] = [];
  for (const [label, values] of Object.entries(selection)) {
    values.forEach((value, i) => out.push([`spec[${label}][${i}]`, value]));
  }
  return out;
}

export function specParams(selection: SpecSelection): Record<string, string> {
  return Object.fromEntries(specEntries(selection));
}

/** Append the selection to a query string being built. */
export function appendSpecs(query: URLSearchParams, selection: SpecSelection): URLSearchParams {
  for (const [k, v] of specEntries(selection)) query.append(k, v);
  return query;
}

/** The selection with one value toggled — for a link that adds or removes it. */
export function toggleSpec(selection: SpecSelection, label: string, value: string): SpecSelection {
  const next: SpecSelection = {};
  let found = false;

  for (const [l, values] of Object.entries(selection)) {
    if (specKey(l) !== specKey(label)) {
      next[l] = values;
      continue;
    }
    found = true;
    const has = values.some((v) => specKey(v) === specKey(value));
    const kept = has ? values.filter((v) => specKey(v) !== specKey(value)) : [...values, value];
    if (kept.length) next[l] = kept;
  }

  if (!found) next[label] = [value];
  return next;
}

/** A `/store` address for a category, the rest of the query and a selection. */
export function storeHref(
  base: Record<string, string | undefined>,
  selection: SpecSelection,
): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v) query.set(k, v);
  appendSpecs(query, selection);
  const qs = query.toString();
  return qs ? `/store?${qs}` : "/store";
}
