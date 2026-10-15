"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CropStage, cropRatios, type CropRect } from "@/components/admin/crop-stage";
import { imageHint, specFor, type ImageSpec, type ImageSpecKey, type UploadLimits } from "@/lib/image-specs";

type Spec = ImageSpecKey | ImageSpec | undefined;

type Ctx = {
  /**
   * Opens the crop step for each picture in `files` before it is uploaded.
   * Resolves with the files to upload — cropped, or as they were — or null
   * when the editor cancelled, in which case nothing is uploaded.
   */
  prepare: (files: File[], spec?: Spec) => Promise<File[] | null>;
  limits: UploadLimits;
};

const CropContext = createContext<Ctx | null>(null);

/** Outside the console (no provider) a file goes up as it is. */
const passThrough: Ctx = { prepare: async (files) => files, limits: { maxKb: null } };

export function useCropBeforeUpload(): Ctx {
  return useContext(CropContext) ?? passThrough;
}

export function useUploadLimits(): UploadLimits {
  return (useContext(CropContext) ?? passThrough).limits;
}

/** The types the browser can crop. SVG, GIF, AVIF and the rest go up as they are. */
const CROPPABLE = ["image/jpeg", "image/png", "image/webp"];

type Item = { file: File; url: string; width: number; height: number };

async function load(file: File): Promise<Item | null> {
  if (!CROPPABLE.includes(file.type)) return null;
  try {
    // The size as the picture is seen — after its EXIF orientation.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const item = { file, url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return item;
  } catch {
    return null; // Not decodable here: the server will say what it thinks.
  }
}

/** The size a crop is written at: down to the spec, never up. */
function targetSize(rect: CropRect, spec: ImageSpec | undefined) {
  if (!spec) return { w: rect.w, h: rect.h };
  // A crop at the field's own ratio, at least its size, comes out exactly at
  // its size — not 1199 × 630 from rounding the scale.
  if (spec.ratio !== "free" && Math.abs(rect.w / rect.h - spec.ratio) / spec.ratio < 0.01
    && rect.w >= spec.width && rect.h >= spec.height) {
    return { w: spec.width, h: spec.height };
  }
  const k = Math.min(1, spec.width / rect.w, spec.height / rect.h);
  return { w: Math.max(1, Math.round(rect.w * k)), h: Math.max(1, Math.round(rect.h * k)) };
}

async function render(item: Item, rect: CropRect, spec: ImageSpec | undefined, maxKb: number | null): Promise<File> {
  const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
  const { w, h } = targetSize(rect, spec);

  // Down in halves when shrinking a lot: one big step aliases.
  let source: CanvasImageSource = bitmap;
  let sx = rect.x, sy = rect.y, sw = rect.w, sh = rect.h;
  while (sw / 2 > w * 1.5) {
    const half = document.createElement("canvas");
    half.width = Math.round(sw / 2);
    half.height = Math.round(sh / 2);
    const c = half.getContext("2d")!;
    c.imageSmoothingQuality = "high";
    c.drawImage(source, sx, sy, sw, sh, 0, 0, half.width, half.height);
    source = half;
    sx = 0; sy = 0; sw = half.width; sh = half.height;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  bitmap.close();

  const type = item.file.type;
  const blobAt = (q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  let blob = await blobAt(type === "image/png" ? undefined : 0.9);
  // Over the library's limit: a lossy picture tries twice more, smaller.
  if (blob && maxKb && blob.size > maxKb * 1024 && type !== "image/png") {
    for (const q of [0.8, 0.7]) {
      blob = await blobAt(q);
      if (blob && blob.size <= maxKb * 1024) break;
    }
  }
  if (!blob) throw new Error("This browser could not write the cropped picture.");
  if (maxKb && blob.size > maxKb * 1024) {
    throw new Error(`The cropped picture is ${Math.round(blob.size / 1024)} KB, over the ${maxKb} KB limit. Crop a smaller area.`);
  }
  return new File([blob], item.file.name, { type, lastModified: Date.now() });
}

/**
 * The crop step every image upload in the console goes through
 * (docs/media.md "Crop before upload"), mounted once by the admin layout.
 *
 * A picked JPEG, PNG or WebP opens here first, on the field's own ratio —
 * alone when the field requires it — with zoom. "Crop & upload" crops and
 * scales it in the browser (down to the field's size, never up) and only the
 * result is uploaded; "Use whole image" sends it as it is. Several at once
 * are a queue, with "Upload the rest as they are". Everything else — SVG,
 * GIF, video, documents — goes straight up.
 */
export function CropBeforeUploadProvider({ maxKb, children }: { maxKb: number | null; children: ReactNode }) {
  const [queue, setQueue] = useState<{ items: (Item | File)[]; index: number; spec?: ImageSpec } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rect, setRect] = useState<CropRect | null>(null);
  const done = useRef<{ out: File[]; resolve: (files: File[] | null) => void } | null>(null);

  const finish = (files: File[] | null) => {
    queue?.items.forEach((i) => { if (!(i instanceof File)) URL.revokeObjectURL(i.url); });
    setQueue(null);
    setError(null);
    setRect(null);
    done.current?.resolve(files);
    done.current = null;
  };

  /** Move past the current picture, given what to upload for it. */
  const advance = (file: File | null) => {
    if (!queue || !done.current) return;
    setError(null);
    if (file) done.current.out.push(file);
    let index = queue.index + 1;
    // Anything the browser cannot crop goes straight into the output.
    while (index < queue.items.length && queue.items[index] instanceof File) {
      done.current.out.push(queue.items[index] as File);
      index++;
    }
    if (index >= queue.items.length) finish(done.current.out);
    else { setRect(null); setQueue({ ...queue, index }); }
  };

  const prepare = useCallback(async (files: File[], spec?: Spec) => {
    const items = await Promise.all(files.map(async (f) => (await load(f)) ?? f));
    if (!items.some((i) => !(i instanceof File))) return files;
    return new Promise<File[] | null>((resolve) => {
      done.current = { out: [], resolve };
      const first = items.findIndex((i) => !(i instanceof File));
      done.current.out.push(...(items.slice(0, first) as File[]));
      setQueue({ items, index: first, spec: specFor(spec) });
    });
  }, []);

  const current = queue ? queue.items[queue.index] : undefined;
  const item = current && !(current instanceof File) ? current : null;
  const croppable = queue ? queue.items.filter((i) => !(i instanceof File)) : [];
  const position = item ? croppable.indexOf(item) + 1 : 0;

  const crop = async () => {
    if (!item || !rect) return;
    setBusy(true);
    try {
      const file = await render(item, rect, queue?.spec, maxKb);
      advance(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The picture could not be cropped.");
    } finally {
      setBusy(false);
    }
  };

  const restAsTheyAre = () => {
    if (!queue || !done.current) return;
    done.current.out.push(...queue.items.slice(queue.index).map((i) => (i instanceof File ? i : i.file)));
    finish(done.current.out);
  };

  const small = item && rect && queue?.spec && queue.spec.ratio !== "free"
    && (rect.w < queue.spec.width || rect.h < queue.spec.height);

  const ctx = useMemo<Ctx>(() => ({ prepare, limits: { maxKb } }), [prepare, maxKb]);

  return (
    <CropContext.Provider value={ctx}>
      {children}
      <Modal
        open={!!item}
        onClose={() => finish(null)}
        size="lg"
        dataAttr="crop-before-upload"
        title={item ? `Crop ${item.file.name}` : "Crop"}
        description={
          <>
            {imageHint(queue?.spec, { maxKb })}
            {croppable.length > 1 && <> · Picture {position} of {croppable.length}</>}
          </>
        }
        footer={item && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={crop} pending={busy} disabled={busy} data-crop-confirm>
              {busy ? "Cropping…" : "Crop & upload"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => advance(item.file)} disabled={busy} data-crop-whole>
              Use whole image
            </Button>
            {croppable.length > 1 && position < croppable.length && (
              <Button type="button" variant="ghost" onClick={restAsTheyAre} disabled={busy}>
                Upload the rest as they are
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => finish(null)} disabled={busy} className="ml-auto">
              Cancel
            </Button>
          </div>
        )}
      >
        {item && (
          <div key={item.url}>
            {error && <p role="alert" className="mb-3 text-13 text-err">{error}</p>}
            <CropStage
              id="pre-crop"
              src={item.url}
              width={item.width}
              height={item.height}
              ratios={cropRatios(item.width, item.height, queue?.spec)}
              onChange={setRect}
            />
            {small && (
              <p className="mt-2 text-center text-12-5 text-warn" data-crop-small>
                This crop is smaller than the {queue!.spec!.width} × {queue!.spec!.height} px recommended, so it may look soft.
              </p>
            )}
          </div>
        )}
      </Modal>
    </CropContext.Provider>
  );
}
