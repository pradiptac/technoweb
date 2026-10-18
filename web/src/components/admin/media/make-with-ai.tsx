"use client";

import { useEffect, useId, useRef, useState } from "react";
import { discardImageAction, keepImageAction, makeImageAction } from "@/app/admin/(app)/media/ai-image-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ImageShapeKey, ImageStatus, ImageStyleKey, MadeImage, PickedFile } from "@/types/media-ai";

const number = new Intl.NumberFormat("en-IN");

// Literal class names (Tailwind only sees whole strings), one box per shape.
const BOX: Record<ImageShapeKey, string> = {
  wide: "aspect-[16/9] max-w-md",
  landscape: "aspect-[4/3] max-w-md",
  square: "aspect-square max-w-xs",
  portrait: "aspect-[3/4] max-w-[15rem]",
  banner: "aspect-[21/9] max-w-md",
};

const RATIO: Record<ImageShapeKey, number> = { wide: 16 / 9, landscape: 4 / 3, square: 1, portrait: 3 / 4, banner: 21 / 9 };

/** The shape closest to a field's ratio, in log space so 2:1 is as far from 1:1 as 1:2; none for a free field. */
export function nearestShape(ratio: number | "free" | undefined): ImageShapeKey | undefined {
  if (typeof ratio !== "number" || !(ratio > 0)) return undefined;

  return (Object.keys(RATIO) as ImageShapeKey[]).reduce((best, key) =>
    Math.abs(Math.log(RATIO[key] / ratio)) < Math.abs(Math.log(RATIO[best] / ratio)) ? key : best);
}

/** The description's first sentence, short enough for alt text. */
function altFrom(description: string): string {
  return (description.trim().split(/(?<=[.!?])\s/)[0] ?? "").slice(0, 125).trim();
}

/**
 * Describe a picture, make it, keep it (0.184.0, docs/ai-images.md). Sits inside
 * the media picker's dialog and the library's own, so it draws no dialog.
 * Nothing is stored until "Use this picture"; a preview left behind is
 * discarded when this unmounts.
 */
export function MakeWithAi({ status, initialShape, folderId, onKept }: {
  status: ImageStatus;
  initialShape?: ImageShapeKey;
  folderId?: number | null;
  onKept: (file: PickedFile) => void;
}) {
  const id = useId();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyleKey>(status.styles[0]?.value ?? "photo");
  const [shape, setShape] = useState<ImageShapeKey>(initialShape ?? "wide");
  const [image, setImage] = useState<MadeImage | null>(null);
  const [made, setMade] = useState<ImageShapeKey>("wide");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState<"make" | "keep" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(status.used);
  // The token of a preview not yet kept, for the cleanup below.
  const open = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (open.current) void discardImageAction(open.current);
    };
  }, []);

  function drop() {
    if (open.current) void discardImageAction(open.current);
    open.current = null;
    setImage(null);
  }

  async function make() {
    setBusy("make");
    setError(null);
    try {
      const res = await makeImageAction({ prompt: prompt.trim(), style, shape });
      if (res.ok && !mounted.current) {
        // The dialog closed while this was being made: nobody will see it, so it goes now.
        void discardImageAction(res.image.token);
      } else if (res.ok) {
        open.current = res.image.token;
        setImage(res.image);
        setMade(shape);
        setAlt(altFrom(prompt));
        setUsed((n) => n + 1);
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function again() {
    drop();
    await make();
  }

  async function keep() {
    if (!image) return;
    setBusy("keep");
    setError(null);
    // Taken before the await: closing the dialog mid-keep must not discard the file being kept.
    const token = open.current;
    open.current = null;
    try {
      const res = await keepImageAction(image.token, alt.trim(), folderId);
      if (res.ok) {
        setImage(null);
        onKept(res.file);
      } else {
        open.current = token;
        setError(res.error);
      }
    } catch (e) {
      open.current = token;
      throw e;
    } finally {
      setBusy(null);
    }
  }

  const chip = (on: boolean) => cn(
    "rounded border px-2.5 py-1.5 text-12-5 font-semibold transition-colors",
    on ? "border-brand-600 bg-brand-600 text-brand-on" : "border-line-strong bg-card text-ink hover:border-brand-600",
  );

  return (
    <div className="grid gap-4" data-make-with-ai>
      {error && <Alert tone="err" title="The picture could not be made" dismissible={false}>{error}</Alert>}

      <div>
        <Field label="Describe the picture" htmlFor={`${id}-prompt`} hint="Pictures never show real people, other companies’ logos, or any lettering." className="mb-1">
          <Textarea id={`${id}-prompt`} rows={3} minLength={10} maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy !== null} />
        </Field>
        <p className="text-right text-11-5 text-muted">{number.format(prompt.length)} of {number.format(1000)}</p>
      </div>

      <div>
        <p id={`${id}-style`} className="mb-1.5 text-13 font-semibold">Style</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-style`}>
        {status.styles.map((s) => (
          <button key={s.value} type="button" aria-pressed={s.value === style} className={chip(s.value === style)} onClick={() => setStyle(s.value)} disabled={busy !== null}>{s.label}</button>
        ))}
        </div>
      </div>
      <div>
        <p id={`${id}-shape`} className="mb-1.5 text-13 font-semibold">Shape</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-shape`}>
        {status.shapes.map((s) => (
          <button key={s.value} type="button" aria-pressed={s.value === shape} className={chip(s.value === shape)} onClick={() => setShape(s.value)} disabled={busy !== null}>{s.label}</button>
        ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" pending={busy === "make"} disabled={busy !== null || prompt.trim().length < 10} onClick={make}>Make picture</Button>
        <span className="text-12-5 text-muted">This can take up to a minute.</span>
      </div>

      {image && (
        <div className="grid gap-3 rounded border border-line-strong bg-surface p-3">
          <div className={cn("mx-auto w-full overflow-hidden rounded bg-card", BOX[made])}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a private preview streamed through a route handler */}
            <img src={`/api/admin/media/ai-image/${image.token}`} width={image.width} height={image.height} alt="" className="size-full object-cover" />
          </div>
          <Field label="Alt text" htmlFor={`${id}-alt`} hint="Read aloud in place of the picture. Describe what it shows." className="mb-0">
            <Input
              id={`${id}-alt`} value={alt} maxLength={255} onChange={(e) => setAlt(e.target.value)} disabled={busy !== null}
              // Inside a form in most places this dialog opens: Enter must not submit the record behind it.
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void keep(); } }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" pending={busy === "keep"} disabled={busy !== null} onClick={keep}>Use this picture</Button>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={again}>Try again</Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={drop}>Discard</Button>
          </div>
        </div>
      )}

      <p className="text-12-5 text-muted">{number.format(used)} of {number.format(status.cap)} pictures used today</p>
    </div>
  );
}
