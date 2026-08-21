"use client";

import { useActionState, useState } from "react";
import { uploadCoverAction, type UploadState } from "@/app/admin/(app)/media-actions";

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
  defaultPath, defaultUrl,
}: {
  defaultPath: string | null;
  defaultUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(uploadCoverAction, initial);
  // Derived, not synced: a fresh upload wins over the saved cover, and
  // clearing wins over both. Mirroring the action result into state with an
  // effect would just be a slower way to say the same thing.
  const [cleared, setCleared] = useState(false);

  const path = cleared ? "" : state.path ?? defaultPath ?? "";
  const url = cleared ? "" : state.url ?? defaultUrl ?? "";

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-[13.5px] font-semibold">Cover image</span>

      {/* What actually saves with the post. */}
      <input type="hidden" name="cover_image_path" value={path} />

      {url ? (
        <div className="mb-2.5 overflow-hidden rounded border border-line-strong bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="block h-32 w-full object-cover" />
        </div>
      ) : (
        <div className="mb-2.5 grid h-32 place-items-center rounded border border-dashed border-line-strong bg-surface text-[13px] text-muted">
          No cover set
        </div>
      )}

      {state.error && <p className="mb-2 text-[12.5px] text-err">{state.error}</p>}

      <input
        type="file"
        name="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
        aria-label="Choose a cover image"
        className="w-full rounded border border-line-strong bg-white px-[13px] py-[9px] text-[13px]"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          // Upload the moment a file is chosen — one less button to press,
          // and the preview updates immediately.
          setCleared(false);
          const data = new FormData();
          data.append("file", file);
          formAction(data);
        }}
      />

      <p className="mt-1.5 text-[12.5px] text-faint">
        {pending ? "Uploading…" : "PNG, JPG, GIF, WebP or SVG."}
      </p>

      {path && (
        <button
          type="button"
          onClick={() => setCleared(true)}
          className="mt-1 py-1 text-[12.5px] font-semibold text-brand-600 hover:underline"
        >
          Remove cover
        </button>
      )}
    </div>
  );
}
