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

      {url ? (
        <div className="mb-2 overflow-hidden rounded border border-line-strong bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="block h-20 w-full object-cover" />
        </div>
      ) : (
        // An empty picker was a 128px box saying nothing. A thin strip says
        // the same thing and leaves the space to fields that hold data.
        <div className="mb-2 grid h-11 place-items-center rounded border border-dashed border-line-strong bg-surface text-[12.5px] text-muted">
          {`No ${label.toLowerCase()} set`}
        </div>
      )}

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
        onPick={(image) => { setCleared(false); setPicked({ path: image.path, url: image.url }); }}
      />

      {path && (
        <button
          type="button"
          onClick={() => { setCleared(true); setPicked(null); }}
          className="mt-1 py-1 text-[12.5px] font-semibold text-brand-ink hover:underline"
        >
          {`Remove ${label.toLowerCase()}`}
        </button>
      )}
    </div>
  );
}
