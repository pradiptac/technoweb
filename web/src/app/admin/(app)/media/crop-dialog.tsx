"use client";

import { useActionState, useEffect, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, KeepOriginalToggle } from "@/components/ui/input";
import { CropStage, cropRatios, type CropRect } from "@/components/admin/crop-stage";
import { cropMediaAction, type CropState } from "./actions";
import { Dialog } from "./item-menu";
import type { MediaItem } from "@/types/api";

/**
 * Crop a file already in the library — on the server, which keeps the
 * version history and `as_copy` (docs/media.md).
 *
 * The surface is `CropStage`, the same one the crop step before an upload
 * uses (0.169.0): a frame in the chosen ratio over the picture, which zooms
 * and pans under it; Free resizes the frame by its corners. It reports the
 * crop in the image's own pixels, which is what the API takes.
 *
 * A row with no recorded dimensions cannot be cropped here — the stage needs
 * the natural size to convert — and an SVG never reaches this dialog.
 */
export function CropDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [state, action, pending] = useActionState<CropState, FormData>(cropMediaAction, {});
  const [rect, setRect] = useState<CropRect | null>(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  const width = item.width ?? 0;
  const height = item.height ?? 0;

  return (
    <Dialog title={`Crop ${item.filename}`} onClose={onClose}>
      <Form action={action} state={state}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="x" value={rect?.x ?? 0} />
        <input type="hidden" name="y" value={rect?.y ?? 0} />
        <input type="hidden" name="width" value={rect?.w ?? 0} />
        <input type="hidden" name="height" value={rect?.h ?? 0} />

        {state.error && <Alert tone="err" title="Could not crop">{state.error}</Alert>}

        {width && height ? (
          <CropStage
            key={epoch}
            id={`crop-${item.id}`}
            src={item.url}
            width={width}
            height={height}
            ratios={cropRatios(width, height).filter((r) => r.label !== "Original" || r.value)}
            onChange={setRect}
          />
        ) : (
          <p className="text-13 text-muted">This file has no recorded size, so it cannot be cropped here.</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" pending={pending} disabled={!rect || rect.w < 8}>
            {pending ? "Cropping…" : "Crop"}
          </Button>
          <button
            type="button"
            onClick={() => setEpoch((n) => n + 1)}
            className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          <KeepOriginalToggle id={`crop-copy-${item.id}`} />
        </div>
      </Form>
    </Dialog>
  );
}
