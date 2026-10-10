/**
 * Edit on the page (0.128.0, `docs/page-builder.md` "Edit on the page"): which
 * of a section's fields the live preview lets an editor change in place.
 *
 * The list is the API's — `inline_fields` on `GET /admin/pages/builder`, read
 * off the save's own rules — as paths with `*` for a row (`items.*.title`)
 * and the length each is held to. Nothing here names a field. No directive:
 * the builder (a client component) and the preview's bridge both import it.
 */
/** `widget` (the layout section, 0.156.0): the widget type the path applies to — `text` is a heading's words and a point's on a list. */
export type InlineSpec = { path: string; max: number; widget?: string };
export type InlinePath = (string | number)[];
/** `scope` is the id of the layout widget the words belong to, so the preview looks for them inside that widget only. */
export type InlineValue = { path: InlinePath; value: string; max: number; scope?: string };

/**
 * Every in-place field of one section's `data` that holds a single line of
 * words now. An empty field has nothing on the page to press, and a value
 * with a line break keeps its card: one line is what a heading on the page
 * can honestly be edited as.
 */
export function inlineValues(data: unknown, specs: InlineSpec[] | undefined): InlineValue[] {
  const out: InlineValue[] = [];
  for (const spec of specs ?? []) {
    const found: InlineValue[] = [];
    walk(data, spec.path.split("."), [], spec.max, found);
    if (!spec.widget) { out.push(...found); continue; }
    // A layout path names every widget's `text`; only those of the spec's type are its words, each scoped to its widget.
    for (const field of found) {
      const owner = ownerOf(data, field.path);
      if (owner?.type === spec.widget) out.push({ ...field, scope: owner.id });
    }
  }
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

type Owner = { type: string; id?: string };

/** The widget a path sits in: the nearest object on the way down (the leaf's parents, not the leaf) that has a `type`. */
function ownerOf(data: unknown, path: InlinePath): Owner | undefined {
  let owner: Owner | undefined;
  let value = data;
  for (const key of path) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const t = (value as Record<string, unknown>).type;
      const id = (value as Record<string, unknown>).id;
      if (typeof t === "string") owner = { type: t, id: typeof id === "string" ? id : undefined };
    }
    value = value && typeof value === "object" ? (value as Record<string | number, unknown>)[key] : undefined;
  }
  return owner;
}

/**
 * The spec a concrete path falls under — `["items", 2, "title"]` under `items.*.title` — or undefined.
 * A spec naming a `widget` also needs the path to sit in a widget of that type in `data`, so a heading's
 * `text` path never writes onto a rich-text widget.
 */
export function specFor(specs: InlineSpec[] | undefined, path: InlinePath, data?: unknown): InlineSpec | undefined {
  return specs?.find((spec) => {
    const parts = spec.path.split(".");
    if (parts.length !== path.length || !parts.every((part, i) => (part === "*" ? typeof path[i] === "number" : part === path[i]))) return false;
    return !spec.widget || ownerOf(data, path)?.type === spec.widget;
  });
}

/** A message's `path`, checked for shape: a short list of keys and row numbers. */
export function isInlinePath(path: unknown): path is InlinePath {
  return Array.isArray(path) && path.length > 0 && path.length <= 12
    && path.every((p) => (typeof p === "string" && /^[a-z_]{1,40}$/.test(p)) || (Number.isInteger(p) && (p as number) >= 0 && (p as number) < 100));
}
