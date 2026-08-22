"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { uploadCoverAction } from "@/app/admin/(app)/media-actions";

const MAX = 12;

type Shot = { path: string; url: string };

/**
 * The product image gallery.
 *
 * Reuses the same upload action as CoverField — the file goes to the media
 * library on its own and only the returned path travels with the product, so
 * a failed upload never costs the editor the rest of the form.
 *
 * The first image is the one the catalogue card and og:image use, which is
 * why reordering matters and is spelled out rather than left to be guessed.
 */
export function GalleryField({
  defaultPaths, defaultUrls, error,
}: {
  defaultPaths: string[];
  defaultUrls: string[];
  error?: string;
}) {
  const [shots, setShots] = useState<Shot[]>(
    defaultPaths.map((path, i) => ({ path, url: defaultUrls[i] ?? "" })),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startUpload] = useTransition();

  /**
   * The server action is awaited here rather than driven through
   * useActionState, because a gallery accumulates: useActionState holds only
   * the most recent result, so appending would mean syncing it into state
   * from an effect — which is both a lint error and the wrong shape. Calling
   * the action from the event that caused it keeps the append where it
   * belongs.
   */
  const upload = (file: File) =>
    startUpload(async () => {
      const data = new FormData();
      data.append("file", file);
      const result = await uploadCoverAction({}, data);

      if (result.error || !result.path || !result.url) {
        setUploadError(result.error ?? "That upload failed. Try again.");
        return;
      }

      setUploadError(null);
      const { path, url } = result;
      setShots((s) => (s.some((x) => x.path === path) ? s : [...s, { path, url }]));
    });

  const move = (i: number, by: number) =>
    setShots((s) => {
      const to = i + by;
      if (to < 0 || to >= s.length) return s;
      const next = [...s];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-[13.5px] font-semibold">Images</span>
      <p className="mb-3 text-[12.5px] text-faint">
        The first image leads the product page and is used when the page is
        shared. Up to {MAX}.
      </p>

      {/* One hidden input per path: the API takes images as a list. */}
      {shots.map((s) => (
        <input key={s.path} type="hidden" name="images" value={s.path} />
      ))}

      {shots.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {shots.map((s, i) => (
            <li key={s.path} className="flex items-center gap-3 rounded border border-line-strong bg-white p-2">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface">
                {s.url
                  ? <Image src={s.url} alt="" width={48} height={48} className="size-full object-contain" unoptimized />
                  : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12px] text-muted">{s.path}</span>
                {i === 0 && <span className="text-[12px] font-semibold text-brand-600">Leads the page</span>}
              </span>
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" aria-label={`Move image ${i + 1} up`}
                  disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Move image ${i + 1} down`}
                  disabled={i === shots.length - 1} onClick={() => move(i, 1)}>↓</Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove image ${i + 1}`}
                  onClick={() => setShots((x) => x.filter((_, n) => n !== i))}>✕</Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {shots.length < MAX && (
        <>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
            aria-label="Add a product image"
            className="w-full rounded border border-line-strong bg-white px-[13px] py-[9px] text-[13px]"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (!file) return;
              // Uploaded on selection, and the input is cleared afterwards so
              // the same file can be picked again if the upload failed. No
              // submit button: this sits inside the product form, and a
              // nested form is not valid HTML.
              upload(file);
              e.currentTarget.value = "";
            }}
          />
          <p className="mt-1.5 text-[12.5px] text-faint">
            {pending ? "Uploading…" : "PNG, JPG, GIF, WebP or SVG."}
          </p>
        </>
      )}

      {uploadError && <p className="mt-2 text-[12.5px] text-err">{uploadError}</p>}

      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}
    </div>
  );
}
