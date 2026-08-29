"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { loadVersionsAction, restoreVersionAction, transformMediaAction } from "./actions";
// Type only. `lib/admin.ts` is server-only, so its *functions* reach this
// component through the actions above rather than by import.
import type { MediaVersionRow } from "@/lib/admin";
import { Dialog } from "./item-menu";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/api";

/**
 * Turn, mirror and adjust an image.
 *
 * Every edit here is a **server** operation — GD rewrites the file and the row
 * comes back with new dimensions — so there is no client-side preview to
 * approve and nothing to cancel. That is why the turns and mirrors apply on
 * click rather than collecting into a pending state behind an Apply button:
 * a button that stages edits would have to reproduce GD's output in the
 * browser to show them, and a preview that disagrees with the result is worse
 * than no preview.
 *
 * The adjustments are the exception and keep an Apply, because three sliders
 * are one decision rather than three.
 */
export function EditImageDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  /*
    Which row the next edit writes to.

    With "save as a new file" ticked, the *first* edit creates a duplicate —
    and everything after it has to land on that duplicate, or a second click
    would copy the original again and leave two half-edited files. So the
    target moves to the copy as soon as one exists, and the option stops
    applying. The banner says so, because silently ignoring a ticked checkbox
    is its own kind of lie.
  */
  const [target, setTarget] = useState<MediaItem>(item);
  const madeCopy = target.id !== item.id;

  const [keepOriginal, setKeepOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [greyscale, setGreyscale] = useState(false);

  /*
    History, reloaded after every edit — because every edit adds to it.

    Fetched rather than passed in: a version list is only interesting once this
    dialog is open, and loading it with the grid would be forty requests for
    something at most one of which is ever read.
  */
  const [versions, setVersions] = useState<MediaVersionRow[]>([]);

  const loadVersions = useCallback((id: number) => {
    void loadVersionsAction(id).then(setVersions).catch(() => setVersions([]));
  }, []);

  useEffect(() => { loadVersions(target.id); }, [target.id, loadVersions]);

  const apply = (body: Parameters<typeof transformMediaAction>[1]) =>
    start(async () => {
      setError(null);

      const result = await transformMediaAction(target.id, {
        ...body,
        // Only until a copy exists — see the `target` comment above.
        as_copy: keepOriginal && !madeCopy,
      });

      if (result.error || !result.item) {
        setError(result.error ?? "That edit could not be applied.");
        return;
      }

      setTarget(result.item);
      loadVersions(result.item.id);

      // Reset the sliders after an adjustment lands. They describe a change
      // that has now been made, and leaving them set invites applying it
      // twice — each pass compounds on the last, because the file is the
      // input to the next edit.
      if (body.operation === "adjust") {
        setBrightness(0);
        setContrast(0);
        setGreyscale(false);
      }
    });

  return (
    <Dialog title={`Edit ${item.filename}`} onClose={onClose}>
      {error && <Alert tone="err" title="Could not apply that">{error}</Alert>}

      {madeCopy && (
        <Alert tone="info" title="Editing a copy">
          The original is untouched. Everything since the first edit has been
          applied to <strong>{target.filename}</strong>.
        </Alert>
      )}

      {/*
        The preview is the live file, and the URL carries `?v=` — which is what
        makes it change at all. An edit keeps the path, so without the version
        the browser would go on showing the picture it already had and every
        button would look broken.
      */}
      <div className="mb-4 grid min-h-[220px] place-items-center rounded border border-line-strong bg-surface p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={target.url}
          alt={target.alt_text ?? ""}
          className={cn("max-h-[320px] max-w-full object-contain transition-opacity", pending && "opacity-50")}
        />
      </div>

      <p className="mb-1.5 text-[12.5px] font-semibold text-muted">Turn and mirror</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <EditButton label="Rotate left" onClick={() => apply({ operation: "rotate", degrees: 270 })} disabled={pending} />
        <EditButton label="Rotate right" onClick={() => apply({ operation: "rotate", degrees: 90 })} disabled={pending} />
        <EditButton label="Rotate 180°" onClick={() => apply({ operation: "rotate", degrees: 180 })} disabled={pending} />
        <EditButton label="Flip horizontal" onClick={() => apply({ operation: "flip", axis: "horizontal" })} disabled={pending} />
        <EditButton label="Flip vertical" onClick={() => apply({ operation: "flip", axis: "vertical" })} disabled={pending} />
      </div>

      <p className="mb-1.5 text-[12.5px] font-semibold text-muted">Adjust</p>
      <div className="mb-4 rounded border border-line bg-surface px-3.5 py-3">
        <Slider id="brightness" label="Brightness" value={brightness} min={-255} max={255}
          onChange={setBrightness} disabled={pending} />
        <Slider id="contrast" label="Contrast" value={contrast} min={-100} max={100}
          onChange={setContrast} disabled={pending} />

        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={greyscale}
            onChange={(e) => setGreyscale(e.currentTarget.checked)}
            disabled={pending}
            className="size-4 cursor-pointer accent-brand-600"
          />
          Convert to greyscale
        </label>

        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={pending || (brightness === 0 && contrast === 0 && !greyscale)}
            onClick={() => apply({ operation: "adjust", brightness, contrast, greyscale })}
          >
            {pending ? "Applying…" : "Apply adjustment"}
          </Button>
          <span className="text-[12.5px] text-faint">
            Applied to the file — each pass builds on the last.
          </span>
        </div>
      </div>

      {/*
        The history, and the reason an in-place edit is survivable at all.

        Every operation archives the bytes it is about to overwrite, so this is
        the undo that the "no undo" warning below would otherwise be admitting
        to having none of. Capped at ten — these are full copies of the file.
      */}
      {versions.length > 0 && (
        <>
          <p className="mb-1.5 text-[12.5px] font-semibold text-muted">
            History <span className="font-normal text-faint">({versions.length})</span>
          </p>
          <ul className="mb-4 max-h-44 space-y-1.5 overflow-y-auto rounded border border-line bg-surface p-2">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-2.5 rounded border border-line bg-card px-2 py-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.url} alt="" className="size-9 shrink-0 rounded border border-line object-cover" />
                <span className="min-w-0 flex-1 text-[12px]">
                  <span className="block font-medium capitalize">{v.operation ?? "edit"}</span>
                  <span className="block text-faint tabular-nums">
                    {v.width && v.height ? `${v.width} x ${v.height} · ` : ""}
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => {
                    setError(null);
                    const result = await restoreVersionAction(target.id, v.id);
                    if (result.error || !result.item) {
                      setError(result.error ?? "That version could not be restored.");
                      return;
                    }
                    setTarget(result.item);
                    loadVersions(result.item.id);
                  })}
                  className={cn(
                    "shrink-0 rounded border border-line-strong bg-card px-2.5 py-1.5 text-[12px] font-semibold",
                    "hover:border-brand-600 hover:text-brand-ink disabled:opacity-50",
                  )}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Done</Button>

        <label
          className={cn(
            "ml-auto flex items-center gap-2 text-[12.5px]",
            madeCopy ? "cursor-not-allowed text-faint" : "cursor-pointer text-muted",
          )}
        >
          <input
            type="checkbox"
            checked={keepOriginal && !madeCopy}
            disabled={madeCopy || pending}
            onChange={(e) => setKeepOriginal(e.currentTarget.checked)}
            className="size-4 accent-brand-600"
          />
          Save as a new file, keeping the original
        </label>
      </div>

      <p className="mt-2 text-[12.5px] text-faint">
        {target.width && target.height
          ? `Now ${target.width} x ${target.height} px.`
          : null}{" "}
        Each edit rewrites the file and keeps the previous copy in the history
        above, so it can be put back.
      </p>
    </Dialog>
  );
}

function EditButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded border border-line-strong bg-card px-3 py-2 text-[12.5px] font-semibold",
        "transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-ink",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {label}
    </button>
  );
}

function Slider({
  id, label, value, min, max, onChange, disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[12.5px] font-medium">{label}</label>
        <span className="text-[12px] text-faint tabular-nums">{value > 0 ? `+${value}` : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-brand-600"
      />
    </div>
  );
}
