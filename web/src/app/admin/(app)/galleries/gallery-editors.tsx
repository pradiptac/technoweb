"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import type { GalleryGroupPayload, GalleryItemPayload } from "@/lib/admin";
import type { GalleryGroup, GalleryItem } from "@/types/api";

type GroupRow = GalleryGroupPayload & { key: string; slug: string };
/**
 * A picture row: what will be posted, plus two things that never are.
 *
 * `url` is the second. `CoverField` renders its preview from a URL and has no
 * way to turn a stored path into one — so a row that carries only the path
 * shows the empty "no image chosen" strip for a picture that is plainly there.
 * The resource hands back both; keeping only the path is what threw the
 * preview away. Stripped before the row is serialised, or it would be posted
 * as a field the API does not accept.
 */
type ItemRow = GalleryItemPayload & { key: string; url: string | null };

/**
 * The tabs and the pictures, edited together and submitted as two JSON fields.
 *
 * **One component for both, because they are not independent.** An item names
 * its tab by slug, so the picture rows need the live list of tabs to build
 * their dropdowns from — including a tab typed a moment ago and not yet saved.
 * Two sibling components would mean lifting that state into the form anyway,
 * at which point this is where it lives.
 *
 * Renaming a tab therefore has to carry its pictures with it. The slug is the
 * link, so a rename rewrites `group` on every item that pointed at the old one
 * — otherwise the save is refused (the API will not accept an item naming a
 * tab that is not in the payload), and refusing somebody's rename because of
 * bookkeeping they cannot see is not a usable form.
 */
export function GalleryEditors({
  groups, items,
}: {
  groups: GalleryGroup[];
  items: GalleryItem[];
}) {
  const [groupRows, setGroupRows] = useState<GroupRow[]>(() =>
    groups.map((g, i) => ({ key: `g${g.id}-${i}`, name: g.name, slug: g.slug })),
  );

  const [itemRows, setItemRows] = useState<ItemRow[]>(() =>
    items.map((it, i) => ({
      key: `i${it.id}-${i}`,
      // The resource returns a URL; the form has to submit the stored path —
      // and the preview needs the URL, so both are kept.
      media_path: pathOf(it.url) ?? "",
      url: it.url,
      alt_text: it.alt ?? "",
      title: it.title ?? "",
      subtitle: it.subtitle ?? "",
      link_url: it.link_url ?? "",
      group: it.group ?? null,
    })),
  );

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  /**
   * Rename a tab, and move every picture filed under it.
   *
   * The rewrite of `group` on the items is the part that matters. Without it a
   * rename orphans them, the API refuses the save with an error about
   * `items.3.group` — a field the editor never touched — and the only way out
   * is to re-file every picture by hand.
   */
  const renameGroup = (i: number, name: string) => {
    // Read outside the updater. A setState updater must be pure — React may
    // invoke it twice — so nesting the second setState inside the first would
    // re-file the pictures twice, which is invisible until the day the two
    // passes disagree.
    const from = groupRows[i].slug;
    const to = slugify(name) || `group-${i + 1}`;

    // A collision would silently merge two tabs, so the second keeps its own.
    const taken = groupRows.some((r, n) => n !== i && r.slug === to);
    const slug = taken ? `${to}-${i + 1}` : to;

    setGroupRows((rows) => rows.map((r, n) => (n === i ? { ...r, name, slug } : r)));
    setItemRows((its) => its.map((it) => (it.group === from ? { ...it, group: slug } : it)));
  };

  const removeGroup = (i: number) => {
    const gone = groupRows[i].slug;
    setGroupRows((rows) => rows.filter((_, n) => n !== i));
    // The pictures stay and fall back to ungrouped — the same call the API
    // makes with `nullOnDelete`, and the same one the media library makes for
    // a deleted folder. The label is cheap and the pictures are not.
    setItemRows((its) => its.map((it) => (it.group === gone ? { ...it, group: null } : it)));
  };

  const moveGroup = (i: number, by: number) =>
    setGroupRows((rows) => swap(rows, i, i + by));

  const patchItem = (i: number, next: Partial<GalleryItemPayload>) =>
    setItemRows((rows) => rows.map((r, n) => (n === i ? { ...r, ...next } : r)));

  const moveItem = (i: number, by: number) =>
    setItemRows((rows) => swap(rows, i, i + by));

  return (
    <div>
      <input type="hidden" name="groups" value={JSON.stringify(groupRows.map(stripKey))} />
      <input type="hidden" name="items" value={JSON.stringify(itemRows.map(stripKey))} />

      {/* ------------------------------------------------------------ tabs */}

      <h2 className="admin-title mb-1 text-[17px]">Tabs</h2>
      <p className="measure mb-3 text-[13px] text-muted">
        Optional. With one tab or none, the gallery renders as a plain grid —
        a filter with a single option reads as broken rather than as
        unnecessary. Pictures left unfiled still show under “All”.
      </p>

      <ol className="mb-3 grid gap-2">
        {groupRows.map((row, i) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2 rounded-lg border border-line-strong bg-card p-3">
            {/* `mb-0`: a Field's wrapper carries mb-[18px], and flex aligns on
                the margin box — so without it the buttons sit 18px low. */}
            <Field label={`Tab ${i + 1}`} htmlFor={`gname-${row.key}`} className="mb-0 min-w-[12rem] flex-1">
              <Input
                id={`gname-${row.key}`}
                value={row.name}
                onChange={(e) => renameGroup(i, e.target.value)}
                placeholder="Networking"
              />
            </Field>

            <code className="mb-2 font-mono text-[12px] text-muted">{row.slug}</code>

            <div className="mb-2 ml-auto flex gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => moveGroup(i, -1)} disabled={i === 0}>
                ↑<span className="sr-only">Move {row.name || `tab ${i + 1}`} up</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => moveGroup(i, 1)} disabled={i === groupRows.length - 1}>
                ↓<span className="sr-only">Move {row.name || `tab ${i + 1}`} down</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-err" onClick={() => removeGroup(i)}>
                Remove<span className="sr-only"> {row.name || `tab ${i + 1}`}</span>
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button" variant="secondary" size="sm" className="mb-8"
        onClick={() =>
          setGroupRows((rows) => [
            ...rows,
            { key: `newg-${rows.length}-${Date.now()}`, name: "", slug: `group-${rows.length + 1}` },
          ])
        }
      >
        Add tab
      </Button>

      {/* -------------------------------------------------------- pictures */}

      <h2 className="admin-title mb-3 text-[17px]">Pictures</h2>

      {itemRows.length === 0 && (
        <p className="mb-4 rounded border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
          No pictures yet. A gallery with none renders nothing at all — the
          shortcode is simply absent from the page.
        </p>
      )}

      <ol className="grid gap-4">
        {itemRows.map((row, i) => (
          <li key={row.key} className="rounded-lg border border-line-strong bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-muted">Picture {i + 1}</span>
              <div className="ml-auto flex gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => moveItem(i, -1)} disabled={i === 0}>
                  ↑<span className="sr-only">Move picture {i + 1} up</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => moveItem(i, 1)} disabled={i === itemRows.length - 1}>
                  ↓<span className="sr-only">Move picture {i + 1} down</span>
                </Button>
                <Button
                  type="button" variant="ghost" size="sm" className="text-err"
                  onClick={() => setItemRows((rows) => rows.filter((_, n) => n !== i))}
                >
                  Remove<span className="sr-only"> picture {i + 1}</span>
                </Button>
              </div>
            </div>

            <CoverField
              name={`media-${row.key}`}
              label="Image"
              // The grid and the lightbox both draw a 4:3 well.
              hint="PNG, JPG, GIF or WebP. 4:3 — around 1200 x 900 px."
              defaultPath={row.media_path || null}
              defaultUrl={row.url}
              accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
              onPathChange={(path) => patchItem(i, { media_path: path ?? "" })}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor={`t-${row.key}`}>
                <Input id={`t-${row.key}`} value={row.title ?? ""} onChange={(e) => patchItem(i, { title: e.target.value })} />
              </Field>

              <Field
                label="Subtitle"
                htmlFor={`st-${row.key}`}
                hint="The line under the title, in the grid and in the lightbox."
              >
                <Input id={`st-${row.key}`} value={row.subtitle ?? ""} onChange={(e) => patchItem(i, { subtitle: e.target.value })} />
              </Field>

              <Field
                label="Alt text"
                htmlFor={`a-${row.key}`}
                hint="What the picture shows. Left blank, the media library's own description is used."
              >
                <Input id={`a-${row.key}`} value={row.alt_text ?? ""} onChange={(e) => patchItem(i, { alt_text: e.target.value })} />
              </Field>

              <Field label="Tab" htmlFor={`g-${row.key}`} variant="float-static">
                <Select
                  id={`g-${row.key}`}
                  value={row.group ?? ""}
                  onChange={(e) => patchItem(i, { group: e.target.value || null })}
                >
                  <option value="">No tab — shows under “All” only</option>
                  {groupRows.map((g) => (
                    <option key={g.slug} value={g.slug}>{g.name || g.slug}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button" variant="secondary" size="sm" className="mt-4"
        onClick={() =>
          setItemRows((rows) => [
            ...rows,
            {
              key: `newi-${rows.length}-${Date.now()}`,
              media_path: "", url: null,
              alt_text: "", title: "", subtitle: "", link_url: "", group: null,
            },
          ])
        }
      >
        Add picture
      </Button>
    </div>
  );
}

function swap<T>(rows: T[], i: number, to: number): T[] {
  if (to < 0 || to >= rows.length) return rows;
  const copy = [...rows];
  [copy[i], copy[to]] = [copy[to], copy[i]];
  return copy;
}

/**
 * The row without the fields that are the client's business only.
 *
 * `key` is React's. `url` is the preview's — the API takes a path, and posting
 * a URL alongside it would be a second answer to where the file is.
 */
function stripKey<T extends { key: string }>(row: T): Omit<T, "key" | "url"> {
  const { key, url, ...rest } = row as T & { url?: unknown };
  void key;
  void url;
  return rest as Omit<T, "key" | "url">;
}

/**
 * The stored path from a resolved URL.
 *
 * The resource hands back `…/storage/media/2026/09/x.jpg` and the form has to
 * submit `media/2026/09/x.jpg`. Splitting on the storage segment rather than
 * stripping a known origin keeps this working when the API host differs
 * between environments, which it does.
 */
function pathOf(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/";
  const at = url.indexOf(marker);
  return at === -1 ? url : url.slice(at + marker.length);
}
