"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import type { SliderMeta, SlidePayload, SliderTransitionOption } from "@/lib/admin";
import type { Slide } from "@/types/api";
import { ReorderButtons } from "@/components/admin/reorder-buttons";

/**
 * A slide row: what will be posted, plus the three URLs that never are.
 *
 * `CoverField` renders its preview from a URL and cannot derive one from a
 * stored path, so a row carrying only the path showed the empty "no image
 * chosen" strip for every slide that had one — measured at 12 empty
 * placeholders on a slider with slides in it. The resource returns both;
 * keeping only the path is what threw the preview away. Stripped before the
 * row is serialised.
 *
 * `durationText` is what the "Show for" box holds, in seconds as typed: the
 * API takes milliseconds, and converting on every keystroke would turn "3." into
 * "3" under the cursor. It becomes `duration_ms` when the row is serialised.
 */
type Row = SlidePayload & {
  key: string;
  mediaUrl: string | null;
  posterUrl: string | null;
  mobileUrl: string | null;
  durationText: string;
};

const BLANK: SlidePayload = {
  kind: "image", media_path: null, poster_path: null, youtube_url: null,
  alt_text: "", heading: "", caption: "", link_url: "", link_label: "",
  caption_position: "bottom-left",
  kicker: "", link2_url: "", link2_label: "", mobile_media_path: null,
  text_tone: "light", overlay: "standard", fit: "cover",
};

/**
 * Every slide is drawn with `object-cover` inside a box whose shape changes
 * with the screen — 16:9 on a phone, a full-height column matching the copy
 * beside it on the homepage hero, 4:3 anywhere else the shortcode is used —
 * so there is no single ratio to ask for. A wide, high-resolution photograph
 * survives all three crops; a narrow or low-resolution one is the file that
 * comes back pixelated on a wide monitor or with its subject cut off on a
 * phone.
 */
const IMAGE_SIZE_HINT =
  "Cropped to fill its box on every screen, so keep the subject centred.";

const POSTER_SIZE_HINT =
  "Shown until a visitor presses play, at the same size as the video.";

const MOBILE_HINT =
  "Optional. Shown instead of the picture above on screens under 768px.";

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
export function SlideRepeater({
  slides, meta = {}, errors,
}: {
  slides: Slide[];
  /** The API's option lists — never written out here. */
  meta?: SliderMeta;
  /** The save's 422, keyed `slides.N.field`; shown under the control it names. */
  errors?: Record<string, string[]>;
}) {
  const { caption_positions: captionPositions = [], text_tones: tones = [], overlays = [], fits = [] } = meta;
  const [rows, setRows] = useState<Row[]>(() =>
    slides.map((s, i) => ({
      key: `s${s.id}-${i}`,
      kind: s.kind,
      // The resource returns a URL; the form has to submit the stored path —
      // and the preview needs the URL, so both are kept.
      media_path: pathOf(s.url),
      poster_path: pathOf(s.poster_url),
      mobile_media_path: pathOf(s.mobile_url ?? null),
      mediaUrl: s.url,
      posterUrl: s.poster_url,
      mobileUrl: s.mobile_url ?? null,
      youtube_url: s.youtube_id ?? null,
      alt_text: s.alt ?? "",
      heading: s.heading ?? "",
      caption: s.caption ?? "",
      link_url: s.link_url ?? "",
      link_label: s.link_label ?? "",
      caption_position: s.caption_position ?? "bottom-left",
      kicker: s.kicker ?? "",
      link2_url: s.link2_url ?? "",
      link2_label: s.link2_label ?? "",
      text_tone: s.text_tone ?? "light",
      overlay: s.overlay ?? "standard",
      fit: s.fit ?? "cover",
      durationText: s.duration_ms ? String(s.duration_ms / 1000) : "",
    })),
  );

  const patch = (i: number, next: Partial<Row>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...next } : row)));

  const move = (i: number, by: number) =>
    setRows((r) => {
      const to = i + by;
      if (to < 0 || to >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[to]] = [copy[to], copy[i]];
      return copy;
    });

  const err = (i: number, field: string) => errors?.[`slides.${i}.${field}`]?.[0];
  const blurb = (list: SliderTransitionOption[], value: string | null | undefined) =>
    list.find((o) => o.value === value)?.blurb;

  return (
    <div>
      {/* The whole list, as the server action reads it. */}
      <input
        type="hidden"
        name="slides"
        value={JSON.stringify(rows.map((row) => stripKey(row)))}
      />

      {rows.length === 0 && (
        <p className="mb-4 rounded border border-dashed border-line-strong px-4 py-6 text-center text-13-5 text-muted">
          No slides yet. A slider with no slides renders nothing at all — the homepage
          falls back to its default panel.
        </p>
      )}

      <ol className="grid gap-4">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-lg border border-line-strong bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-13 font-semibold text-muted">Slide {i + 1}</span>
              <ReorderButtons
                className="ml-auto" index={i} count={rows.length} subject={`slide ${i + 1}`}
                onMove={(by) => move(i, by)}
                onRemove={() => setRows((r) => r.filter((_, n) => n !== i))}
              />
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
                  defaultUrl={row.posterUrl}
                  hint={POSTER_SIZE_HINT}
                  spec="slide"
                  onPathChange={(path) => patch(i, { poster_path: path })}
                />
              </div>
            ) : (
              <div className="mt-3">
                <CoverField
                  name={`media-${row.key}`}
                  label={row.kind === "video" ? "Video file" : "Image"}
                  defaultPath={row.media_path ?? null}
                  defaultUrl={row.mediaUrl}
                  accept={row.kind === "video" ? ".mp4,.webm" : ".png,.jpg,.jpeg,.gif,.webp,.svg"}
                  hint={row.kind === "video" ? "MP4 or WebM, up to 20 MB." : IMAGE_SIZE_HINT}
                  spec="slide"
                  onPathChange={(path) => patch(i, { media_path: path })}
                />
                {row.kind === "video" && (
                  <CoverField
                    name={`poster-${row.key}`}
                    label="Poster image"
                    defaultPath={row.poster_path ?? null}
                    defaultUrl={row.posterUrl}
                    hint={POSTER_SIZE_HINT}
                    spec="slide"
                    onPathChange={(path) => patch(i, { poster_path: path })}
                  />
                )}
                {/* Image slides only: a video or YouTube slide ignores it. A raster, because it is drawn through the image optimiser. */}
                {row.kind === "image" && (
                  <>
                    <CoverField
                      name={`mobile-${row.key}`}
                      label="Phone picture"
                      defaultPath={row.mobile_media_path ?? null}
                      defaultUrl={row.mobileUrl}
                      accept=".png,.jpg,.jpeg,.webp"
                      hint={MOBILE_HINT}
                      spec="slide-mobile"
                      onPathChange={(path) => patch(i, { mobile_media_path: path })}
                    />
                    {err(i, "mobile_media_path") && (
                      <p role="alert" className="-mt-3 mb-3 text-13 text-err">{err(i, "mobile_media_path")}</p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Kicker" htmlFor={`k-${row.key}`} error={err(i, "kicker")} hint="A short line above the heading.">
                <Input id={`k-${row.key}`} maxLength={60} value={row.kicker ?? ""} onChange={(e) => patch(i, { kicker: e.target.value })} />
              </Field>
              <Field label="Heading" htmlFor={`h-${row.key}`}>
                <Input id={`h-${row.key}`} value={row.heading ?? ""} onChange={(e) => patch(i, { heading: e.target.value })} />
              </Field>
              <Field label="Caption" htmlFor={`c-${row.key}`}>
                <Input id={`c-${row.key}`} value={row.caption ?? ""} onChange={(e) => patch(i, { caption: e.target.value })} />
              </Field>
              <Field label="Link URL" htmlFor={`lu-${row.key}`} error={err(i, "link_url")}>
                <Input id={`lu-${row.key}`} value={row.link_url ?? ""} onChange={(e) => patch(i, { link_url: e.target.value })} placeholder="/solutions/networking" />
              </Field>
              <Field label="Link label" htmlFor={`ll-${row.key}`} error={err(i, "link_label")}>
                <Input id={`ll-${row.key}`} value={row.link_label ?? ""} onChange={(e) => patch(i, { link_label: e.target.value })} />
              </Field>
              <Field label="Second button URL" htmlFor={`lu2-${row.key}`} error={err(i, "link2_url")} hint="Drawn only when both the address and the label are set.">
                <Input id={`lu2-${row.key}`} value={row.link2_url ?? ""} onChange={(e) => patch(i, { link2_url: e.target.value })} placeholder="/contact" />
              </Field>
              <Field label="Second button label" htmlFor={`ll2-${row.key}`} error={err(i, "link2_label")}>
                <Input id={`ll2-${row.key}`} maxLength={60} value={row.link2_label ?? ""} onChange={(e) => patch(i, { link2_label: e.target.value })} />
              </Field>
              {captionPositions.length > 0 && (
                /*
                  Per slide, not per slider: the words have to miss whatever
                  the subject of *this* photograph is, and one position for the
                  whole carousel puts them over somebody's face on every other
                  slide. `variant="float-static"` because a select always has a
                  value, so an animated label has nothing to be displaced by
                  and would render on top of the chosen option.
                */
                <Field
                  label="Caption position"
                  htmlFor={`cp-${row.key}`}
                  variant="float-static"
                  hint="Ignored when the slider's layout is split."
                >
                  <Select
                    id={`cp-${row.key}`}
                    value={row.caption_position ?? "bottom-left"}
                    onChange={(e) => patch(i, { caption_position: e.target.value })}
                  >
                    {captionPositions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {tones.length > 0 && (
                <Field label="Text colour" htmlFor={`tt-${row.key}`} variant="float-static" error={err(i, "text_tone")} hint={blurb(tones, row.text_tone)}>
                  <Select id={`tt-${row.key}`} value={row.text_tone ?? "light"} onChange={(e) => patch(i, { text_tone: e.target.value })}>
                    {tones.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {overlays.length > 0 && (
                <Field label="Shade behind the words" htmlFor={`ov-${row.key}`} variant="float-static" error={err(i, "overlay")} hint={blurb(overlays, row.overlay)}>
                  <Select id={`ov-${row.key}`} value={row.overlay ?? "standard"} onChange={(e) => patch(i, { overlay: e.target.value })}>
                    {overlays.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {fits.length > 0 && row.kind !== "youtube" && (
                <Field label="Picture fit" htmlFor={`fit-${row.key}`} variant="float-static" error={err(i, "fit")} hint={blurb(fits, row.fit)}>
                  <Select id={`fit-${row.key}`} value={row.fit ?? "cover"} onChange={(e) => patch(i, { fit: e.target.value })}>
                    {fits.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field
                label="Show for (seconds)"
                htmlFor={`d-${row.key}`}
                error={err(i, "duration_ms")}
                hint="Between 2 and 60. Blank uses the slider's own time."
              >
                <Input
                  id={`d-${row.key}`} type="number" min={2} max={60} step={0.5}
                  value={row.durationText}
                  onChange={(e) => patch(i, { durationText: e.target.value })}
                />
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
        onClick={() => setRows((r) => [
      ...r,
      { ...BLANK, key: `new-${r.length}-${r.length + 1}`, mediaUrl: null, posterUrl: null, mobileUrl: null, durationText: "" },
    ])}
      >
        Add slide
      </Button>
    </div>
  );
}

/**
 * The row without the fields that are the client's business only.
 *
 * `key` is React's; the three URLs are the previews'. The API takes paths, and
 * posting a URL beside one would be a second answer to where the file is.
 * `durationText` becomes milliseconds here; blank is null, which the API reads
 * as "the slider's own interval".
 */
function stripKey({ key, mediaUrl, posterUrl, mobileUrl, durationText, ...slide }: Row): SlidePayload {
  void key;
  void mediaUrl;
  void posterUrl;
  void mobileUrl;
  const seconds = durationText.trim() === "" ? null : Number(durationText);
  return { ...slide, duration_ms: seconds === null || Number.isNaN(seconds) ? null : Math.round(seconds * 1000) };
}

/**
 * The stored path from a resolved URL.
 *
 * The public resource hands back `…/storage/media/2026/08/x.jpg` and the form
 * has to submit `media/2026/08/x.jpg`. Splitting on the storage segment rather
 * than stripping a known origin keeps this working when the API host differs
 * between environments, which it does. The `?v=` an edited file's address
 * carries is dropped: a stored path with a query string is a filename that
 * does not exist.
 */
function pathOf(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/";
  const at = url.indexOf(marker);
  const path = at === -1 ? url : url.slice(at + marker.length);
  return path.split("?")[0];
}
