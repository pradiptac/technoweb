/**
 * Edit on the page (0.128.0, `docs/page-builder.md` "Edit on the page"): which
 * of a section's fields the live preview lets an editor change in place.
 *
 * The list is the API's — `inline_fields` on `GET /admin/pages/builder`, read
 * off the save's own rules — as paths with `*` for a row (`items.*.title`)
 * and the length each is held to. Nothing here names a field. No directive:
 * the builder (a client component) and the preview's bridge both import it.
 */
export type InlineSpec = { path: string; max: number };
export type InlinePath = (string | number)[];
export type InlineValue = { path: InlinePath; value: string; max: number };

/**
 * Every in-place field of one section's `data` that holds a single line of
 * words now. An empty field has nothing on the page to press, and a value
 * with a line break keeps its card: one line is what a heading on the page
 * can honestly be edited as.
 */
export function inlineValues(data: unknown, specs: InlineSpec[] | undefined): InlineValue[] {
  const out: InlineValue[] = [];
  for (const spec of specs ?? []) walk(data, spec.path.split("."), [], spec.max, out);
  return out;
}

function walk(value: unknown, rest: string[], at: InlinePath, max: number, out: InlineValue[]): void {
  if (rest.length === 0) {
    if (typeof value === "string" && value.trim() !== "" && !/[\r\n]/.test(value)) out.push({ path: at, value, max });
    return;
  }
  const [head, ...tail] = rest;
  if (head === "*") {
    if (Array.isArray(value)) value.forEach((item, i) => walk(item, tail, [...at, i], max, out));
    return;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    walk((value as Record<string, unknown>)[head], tail, [...at, head], max, out);
  }
}

/** The spec a concrete path falls under — `["items", 2, "title"]` under `items.*.title` — or undefined. */
export function specFor(specs: InlineSpec[] | undefined, path: InlinePath): InlineSpec | undefined {
  return specs?.find((spec) => {
    const parts = spec.path.split(".");
    return parts.length === path.length && parts.every((part, i) => (part === "*" ? typeof path[i] === "number" : part === path[i]));
  });
}

/** A message's `path`, checked for shape: a short list of keys and row numbers. */
export function isInlinePath(path: unknown): path is InlinePath {
  return Array.isArray(path) && path.length > 0 && path.length <= 6
    && path.every((p) => (typeof p === "string" && /^[a-z_]{1,40}$/.test(p)) || (Number.isInteger(p) && (p as number) >= 0 && (p as number) < 100));
}
