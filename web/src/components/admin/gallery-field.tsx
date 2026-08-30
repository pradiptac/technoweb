"use client";

import Image from "next/image";
import { FileDrop } from "@/components/ui/file-drop";
import { MediaBrowser } from "@/components/admin/media-browser";
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
  const [browsing, setBrowsing] = useState(false);
  // Batch progress, counted in files. See FileDrop for why bytes are not
  // available through a server action.
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, startUpload] = useTransition();

  /**
   * The server action is awaited here rather than driven through
   * useActionState, because a gallery accumulates: useActionState holds only
   * the most recent result, so appending would mean syncing it into state
   * from an effect — which is both a lint error and the wrong shape. Calling
   * the action from the event that caused it keeps the append where it
   * belongs.
   */
  /*
    A whole batch, uploaded one at a time inside one transition.

    Sequential rather than parallel for the reason the media library's own
    uploader is: each call is a server action that also revalidates the page,
    and firing twelve at once makes the count meaningless and hides which one
    failed. Looping *inside* `startUpload` is what makes `pending` describe the
    batch — awaiting `startUpload` itself would not, since it returns void.
  */
  const upload = (files: File[]) =>
    startUpload(async () => {
      setUploadError(null);
      const failures: string[] = [];

      for (const [i, file] of files.entries()) {
        setDone(i);

        const data = new FormData();
        data.append("file", file);
        const result = await uploadCoverAction({}, data);

        if (result.error || !result.path || !result.url) {
          failures.push(result.error ?? `${file.name} could not be uploaded.`);
          continue;
        }

        const { path, url } = result;
        setShots((s) => (s.some((x) => x.path === path) ? s : [...s, { path, url }]));
      }

      setDone(files.length);
      if (failures.length) {
        setUploadError(failures.length === 1 ? failures[0] : `${failures.length} failed. ${failures[0]}`);
      }
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
            // min-w-0 is load-bearing: this li is a grid item, so its
            // min-width defaults to auto and it refuses to shrink below the
            // min-content of the nowrap filename below — which meant the row
            // sat at 544px inside a 300px sidebar and pushed the reorder and
            // remove buttons clean off the right of the screen. The truncate
            // cannot engage until the li is allowed to be narrower than its
            // own content.
            <li key={s.path} className="flex min-w-0 items-center gap-3 rounded border border-line-strong bg-card p-2">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface">
                {s.url
                  ? <Image src={s.url} alt="" width={48} height={48} className="size-full object-contain" unoptimized />
                  : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12px] text-muted">{s.path}</span>
                {i === 0 && <span className="text-[12px] font-semibold text-brand-ink">Leads the page</span>}
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
          <FileDrop
            multiple
            accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
            label="Select images…"
            hint={`PNG, JPG, GIF, WebP or SVG. ${MAX - shots.length} slot${MAX - shots.length === 1 ? "" : "s"} left.`}
            progress={pending ? { done, total } : null}
            onFiles={(files) => {
              /*
                Multiple now, and capped at what is left.

                The old control took one file at a time, so filling a gallery
                meant twelve trips through the file picker. `upload` still runs
                one at a time — it is a server action per file that revalidates
                the page — so this queues them rather than firing them
                together. There is no submit button: this sits inside the
                product form, and a nested form is not valid HTML.
              */
              const batch = files.slice(0, MAX - shots.length);
              setTotal(batch.length);
              setDone(0);
              upload(batch);
            }}
          />

          {/*
            Browsing, beside uploading — the same pairing the cover field has.
            Without it, adding a photograph that is already in the library
            means uploading a second copy of it under a second hashed name.
          */}
          <button
            type="button"
            onClick={() => setBrowsing(true)}
            className="mt-1 py-1 text-[12.5px] font-semibold text-brand-ink hover:underline"
          >
            Or choose from the library
          </button>

          <MediaBrowser
            open={browsing}
            onClose={() => setBrowsing(false)}
            onPick={(image) => setShots((current) => (
              // Already here, or the gallery is full: both are no-ops rather
              // than errors, because neither is a mistake worth a message.
              current.some((x) => x.path === image.path) || current.length >= MAX
                ? current
                : [...current, { path: image.path, url: image.url }]
            ))}
          />
        </>
      )}

      {uploadError && <p className="mt-2 text-[12.5px] text-err">{uploadError}</p>}

      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}
    </div>
  );
}
