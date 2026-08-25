"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import type { SlidePayload } from "@/lib/admin";
import type { Slide } from "@/types/api";

type Row = SlidePayload & { key: string };

const BLANK: SlidePayload = {
  kind: "image", media_path: null, poster_path: null, youtube_url: null,
  alt_text: "", heading: "", caption: "", link_url: "", link_label: "",
};

/**
 * The slides, edited as a list and submitted as one JSON field.
 *
 * Order is the array's order, and the server renumbers `sort_order` from it on
 * save — an editor moving a slide should not also have to renumber the ones
 * around it, which is the failure mode of an editable order column.
 *
 * The three kinds share this row rather than having three forms, because they
 * differ by two fields. Which fields show is driven by `kind`, and the hidden
 * ones keep their values: switching a row to YouTube to look at it and back
 * again must not lose the image that was already chosen.
 */
export function SlideRepeater({ slides }: { slides: Slide[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    slides.map((s, i) => ({
      key: `s${s.id}-${i}`,
      kind: s.kind,
      // The resource returns a URL; the form has to submit the stored path.
      media_path: pathOf(s.url),
      poster_path: pathOf(s.poster_url),
      youtube_url: s.youtube_id ?? null,
      alt_text: s.alt ?? "",
      heading: s.heading ?? "",
      caption: s.caption ?? "",
      link_url: s.link_url ?? "",
      link_label: s.link_label ?? "",
    })),
  );

  const patch = (i: number, next: Partial<SlidePayload>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const move = (i: number, by: number) =>
    setRows((r) => {
      const to = i + by;
      if (to < 0 || to >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });

  return (
    <div>
      {/* The whole list, as the server action reads it. */}
      <input
        type="hidden"
        name="slides"
        value={JSON.stringify(rows.map((row) => stripKey(row)))}
      />

      {rows.length === 0 && (
        <p className="mb-4 rounded border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
          No slides yet. A slider with no slides renders nothing at all — the homepage
          falls back to its default panel.
        </p>
      )}

      <ol className="grid gap-4">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-lg border border-line-strong bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-muted">Slide {i + 1}</span>
              <div className="ml-auto flex gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑<span className="sr-only">Move slide {i + 1} up</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                  ↓<span className="sr-only">Move slide {i + 1} down</span>
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
                  className="text-err"
                >
                  Remove<span className="sr-only"> slide {i + 1}</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor={`kind-${row.key}`} variant="float-static">
                <Select
                  id={`kind-${row.key}`}
                  value={row.kind}
                  onChange={(e) => patch(i, { kind: e.target.value as SlidePayload["kind"] })}
                >
                  <option value="image">Image</option>
                  <option value="video">Video file (MP4 or WebM)</option>
                  <option value="youtube">YouTube</option>
                </Select>
              </Field>

              <Field
                label="Alt text"
                htmlFor={`alt-${row.key}`}
                hint="What the picture shows. Left blank, the media library's own description is used."
              >
                <Input
                  id={`alt-${row.key}`}
                  value={row.alt_text ?? ""}
                  onChange={(e) => patch(i, { alt_text: e.target.value })}
                />
              </Field>
            </div>

            {row.kind === "youtube" ? (
              <div className="mt-3">
                <Field
                  label="YouTube link"
                  htmlFor={`yt-${row.key}`}
                  hint="Paste the watch, share or embed link. Nothing loads from YouTube until a visitor presses play."
                >
                  <Input
                    id={`yt-${row.key}`}
                    value={row.youtube_url ?? ""}
                    onChange={(e) => patch(i, { youtube_url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </Field>
                <CoverField
                  name={`poster-${row.key}`}
                  label="Poster image"
                  defaultPath={row.poster_path ?? null}
                  defaultUrl={null}
                  onPathChange={(path) => patch(i, { poster_path: path })}
                />
              </div>
            ) : (
              <div className="mt-3">
                <CoverField
                  name={`media-${row.key}`}
                  label={row.kind === "video" ? "Video file" : "Image"}
                  defaultPath={row.media_path ?? null}
                  defaultUrl={null}
                  accept={row.kind === "video" ? ".mp4,.webm" : ".png,.jpg,.jpeg,.gif,.webp,.svg"}
                  hint={row.kind === "video" ? "MP4 or WebM, up to 20 MB." : "PNG, JPG, GIF, WebP or SVG."}
                  onPathChange={(path) => patch(i, { media_path: path })}
                />
                {row.kind === "video" && (
                  <CoverField
                    name={`poster-${row.key}`}
                    label="Poster image"
                    defaultPath={row.poster_path ?? null}
                    defaultUrl={null}
                    onPathChange={(path) => patch(i, { poster_path: path })}
                  />
                )}
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Heading" htmlFor={`h-${row.key}`}>
                <Input id={`h-${row.key}`} value={row.heading ?? ""} onChange={(e) => patch(i, { heading: e.target.value })} />
              </Field>
              <Field label="Caption" htmlFor={`c-${row.key}`}>
                <Input id={`c-${row.key}`} value={row.caption ?? ""} onChange={(e) => patch(i, { caption: e.target.value })} />
              </Field>
              <Field label="Link URL" htmlFor={`lu-${row.key}`}>
                <Input id={`lu-${row.key}`} value={row.link_url ?? ""} onChange={(e) => patch(i, { link_url: e.target.value })} placeholder="/solutions/networking" />
              </Field>
              <Field label="Link label" htmlFor={`ll-${row.key}`}>
                <Input id={`ll-${row.key}`} value={row.link_label ?? ""} onChange={(e) => patch(i, { link_label: e.target.value })} />
              </Field>
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() => setRows((r) => [...r, { ...BLANK, key: `new-${r.length}-${r.length + 1}` }])}
      >
        Add slide
      </Button>
    </div>
  );
}

/**
 * The stored path from a resolved URL.
 *
 * The public resource hands back `…/storage/media/2026/08/x.jpg` and the form
 * has to submit `media/2026/08/x.jpg`. Splitting on the storage segment rather
 * than stripping a known origin keeps this working when the API host differs
 * between environments, which it does.
 */
/** The row without its React key, which is a client concern only. */
function stripKey({ key, ...slide }: Row): SlidePayload {
  void key;
  return slide;
}

function pathOf(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/";
  const at = url.indexOf(marker);
  return at === -1 ? url : url.slice(at + marker.length);
}
