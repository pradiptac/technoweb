"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileDrop } from "@/components/ui/file-drop";
import { uploadCoverAction, type UploadState } from "@/app/admin/(app)/media-actions";
import { MediaBrowser } from "@/components/admin/media-browser";

const initial: UploadState = {};

/**
 * Cover image picker.
 *
 * Uploading is its own action rather than part of the post submit: the file
 * goes to the media library immediately and only its path travels with the
 * post. That keeps the post payload plain JSON, lets the same image be reused
 * elsewhere, and means a failed upload does not cost the editor the rest of
 * the form.
 */
export function CoverField({
  defaultPath, defaultUrl, name = "cover_image_path", label = "Cover image",
  accept = ".png,.jpg,.jpeg,.gif,.webp,.svg",
  hint = "PNG, JPG, GIF, WebP or SVG.",
  onPathChange,
}: {
  defaultPath: string | null;
  defaultUrl: string | null;
  /** Solutions store this as hero_image_path rather than cover_image_path. */
  name?: string;
  label?: string;
  /** Widened for video slides, which pick an MP4 rather than an image. */
  accept?: string;
  hint?: string;
  /**
   * Told when the chosen path changes.
   *
   * The hidden input below is enough for a form that posts its fields
   * individually. The slide repeater does not — it serialises its rows into
   * one JSON field — so it needs the value rather than the input.
   */
  onPathChange?: (path: string | null) => void;
}) {
  const [state, formAction, pending] = useActionState(uploadCoverAction, initial);
  // Derived, not synced: a fresh upload wins over the saved cover, and
  // clearing wins over both. Mirroring the action result into state with an
  // effect would just be a slower way to say the same thing.
  const [cleared, setCleared] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  /*
    A file chosen from the library, which beats an upload for the same reason
    an upload beats the saved value: it is the most recent thing the person
    did. Cleared last of all, because "remove" is the most recent thing of all.
  */
  const [picked, setPicked] = useState<{ path: string; url: string } | null>(null);

  const path = cleared ? "" : picked?.path ?? state.path ?? defaultPath ?? "";
  const url = cleared ? "" : picked?.url ?? state.url ?? defaultUrl ?? "";

  // Notifying a parent is a side effect of rendering a new value, so it
  // belongs in an effect — but only when the value actually changed, or a
  // parent that re-renders on the callback would loop.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!onPathChange || reported.current === path) return;
    reported.current = path;
    onPathChange(path || null);
  }, [path, onPathChange]);

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-[13.5px] font-semibold">{label}</span>

      {/* What actually saves with the post. */}
      <input type="hidden" name={name} value={path} />

      {/*
        The picture and the controls for choosing one, side by side.

        They used to stack, which put a 200px preview between the label and the
        drop zone — so on a form with several image fields the thing you press
        was always below the thing you were looking at, and a populated form
        was mostly preview. Beside each other the pair reads as one control:
        this is the image, and this is how you change it.

        `min-w-0` on both halves, because each is a grid item and a grid item's
        automatic minimum is its **min-content** rather than zero — without it
        the drop zone's own label sets a floor and the row stops fitting inside
        a narrow panel. The same defect the campaign block list had.

        One column below `sm`: at 342px a half is about 160px, narrower than
        the drop zone's label, and it would truncate the only instruction the
        control gives.
      */}
      <div className="mb-2 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          {url ? (
            <div className="grid place-items-center overflow-hidden rounded border border-line-strong bg-surface p-3">
          {/*
            One preview treatment everywhere: the whole file, contained, capped
            at 200px and centred. There is deliberately no `fit` prop any more.

            It used to default to a cropped full-width strip, on the argument
            that a blog cover is a photograph with a known ratio and a subject
            in the middle, so the strip was roughly what the site would render.
            That argument is true and it is not worth the cost: an editor
            checking an image wants to see the image, and a picker that crops
            differently on Settings than on a blog post is one whose preview
            cannot be trusted anywhere. A cropped QR code is the extreme of it —
            a preview that cannot be checked by doing the only thing worth doing
            with it.

            `max-h` as well as `max-w`, or a tall narrow mark runs to whatever
            height its ratio asks for and pushes every field below it down the
            page.
          */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="mx-auto block h-auto max-h-[200px] w-auto max-w-[200px] object-contain"
              />
            </div>
          ) : (
            /*
              The empty half still holds the row open, so choosing an image does
              not make the form jump: the preview appears in space that was
              already reserved. `min-h` rather than a fixed height — 200px is
              the cap on a preview, not its size, and matching it exactly would
              leave a tall empty box under a short picture.
            */
            <div className="grid min-h-[6rem] place-items-center rounded border border-dashed border-line-strong bg-surface px-3 py-4 text-center text-[12.5px] text-muted">
              {`No ${label.toLowerCase()} set`}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {state.error && <p className="mb-2 text-[12.5px] text-err">{state.error}</p>}

      <FileDrop
        accept={accept}
        label={`Select ${label.toLowerCase()}…`}
        hint={hint}
        /*
          One file, so the bar has nothing to count and renders indeterminate —
          which is the honest reading of "something is happening and there is
          no measurement". See FileDrop's ProgressBar.
        */
        progress={pending ? { done: 0, total: 1 } : null}
        onFiles={(files) => {
          const file = files[0];
          if (!file) return;
          // Uploaded the moment a file is chosen — one less button to press,
          // and the preview updates immediately.
          setCleared(false);
          setPicked(null);
          const data = new FormData();
          data.append("file", file);
          formAction(data);
        }}
      />

      {/*
        Browsing, beside uploading.

        Without it, using a picture that is already in the library means
        uploading it again — and a library holding four copies of one logo
        under four hashed names is one nobody can find anything in. The dialog
        can upload too, so this is the whole of "choose an image" in one place.
      */}
      {/*
        A row, because these are two buttons that were rendering as one run of
        text: "Or choose from the libraryRemove logo". Both are inline-level
        with nothing between them, so no gap appeared — it reads as a single
        broken label rather than two things you can press, and on the settings
        screen it sits directly under the preview where it is the first thing
        read.

        `justify-between`: browsing is the ordinary action and removing is the
        destructive one, and opposite ends is the same arrangement `FormActions`
        uses for Save and Delete.
      */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => setBrowsing(true)}
          className="py-1 text-[12.5px] font-semibold text-brand-ink hover:underline"
        >
          Or choose from the library
        </button>

        {path && (
          <button
            type="button"
            onClick={() => { setCleared(true); setPicked(null); }}
            /*
              `text-err`, not `text-err-fill`: this is coloured text on a panel,
              which is the first of the two jobs that token has. The fill is for
              white text on a solid badge and measures 3.38:1 as text in dark.
            */
            className="py-1 text-[12.5px] font-semibold text-err hover:underline"
          >
            {`Remove ${label.toLowerCase()}`}
          </button>
        )}
          </div>
        </div>
      </div>

      <MediaBrowser
        open={browsing}
        onClose={() => setBrowsing(false)}
        onPick={(image) => { setCleared(false); setPicked({ path: image.path, url: image.url }); }}
      />

    </div>
  );
}
