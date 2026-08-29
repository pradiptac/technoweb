"use client";

import { useCallback, useEffect, useRef } from "react";
import { IconArrowRight, IconChevronDown, IconClose, IconPen } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/api";

/**
 * Full-screen preview, with the rest of the library still behind it.
 *
 * The old "View" action opened the raw file in a new tab, which is a different
 * thing wearing the same word: it leaves the console, shows the image on the
 * API's origin with no name, no size and no way back except the tab strip, and
 * looking at the next one means returning and starting again. Reviewing a
 * library is a sequence, so the preview has to be one — hence the arrows, the
 * counter, and the keyboard.
 *
 * A real `<dialog>`, for every reason `components/ui/modal.tsx` sets out:
 * focus is trapped, Escape closes it, the rest of the document goes inert to a
 * screen reader, and the top layer means no z-index argument with the sticky
 * console header. It is not `Modal` itself because that renders a titled card
 * with a measure — right for a form, wrong for a photograph, which wants the
 * whole viewport and a dark ground.
 */
export function MediaPreview({
  items, index, onIndex, onClose, onEdit, onDelete,
}: {
  items: MediaItem[];
  /** Index into `items`, or null when nothing is being previewed. */
  index: number | null;
  onIndex: (next: number) => void;
  onClose: () => void;
  onEdit: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null;
  const item = open ? items[index] : null;

  /*
    Wrapping, so the ends of the list are not dead controls.

    A library is browsed in a loop far more often than it is read to the end,
    and a Next that stops doing anything on the last tile reads as broken
    rather than as finished. The counter says where you are, which is what
    stops wrapping being disorienting.
  */
  const step = useCallback((by: number) => {
    if (index === null || items.length === 0) return;
    onIndex((index + by + items.length) % items.length);
  }, [index, items.length, onIndex]);

  // showModal() has to be called imperatively — there is no attribute that
  // produces a *modal* dialog, only a non-modal one with none of the
  // guarantees above.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /*
    Listen for the dialog's own `close` event.

    Escape closes the element directly, so a component tracking `open` in React
    state never hears about it — the state stays open, the effect above sees no
    change, and the preview can never be reopened. That is the classic
    native-dialog bug and it looks exactly like a broken button.
  */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCloseEvent = () => onClose();
    dialog.addEventListener("close", onCloseEvent);
    return () => dialog.removeEventListener("close", onCloseEvent);
  }, [onClose]);

  // Arrow keys, because a viewer that needs the mouse for "next" is one nobody
  // uses twice. Bound to the dialog rather than the document, so it cannot
  // fight the grid behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    };
    const dialog = ref.current;
    dialog?.addEventListener("keydown", onKey);
    return () => dialog?.removeEventListener("keydown", onKey);
  }, [open, step]);

  return (
    <dialog
      ref={ref}
      aria-label={item ? `Preview of ${item.filename}` : "Preview"}
      className={cn(
        // Full-bleed rather than the centred card a <dialog> is by default,
        // and transparent so the ::backdrop is the only ground.
        "m-0 h-full max-h-none w-full max-w-none bg-transparent p-0",
        "text-white backdrop:bg-black/80",
      )}
      // Clicking the ground closes, which is what a lightbox does. The check
      // is that the click landed on the dialog itself rather than bubbling out
      // of the image or the chrome.
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
    >
      {item && (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-2 border-b border-white/15 bg-black/55 px-3 py-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close preview"
              className="grid size-9 shrink-0 place-items-center rounded text-white/85 hover:bg-white/15 hover:text-white"
            >
              <IconClose />
            </button>

            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{item.filename}</span>

            {/* Chrome, not content: each is 36px so it clears the audit's tap
                target check without needing the spacing exception. */}
            <a
              href={item.download_url}
              className="grid size-9 place-items-center rounded text-white/85 hover:bg-white/15 hover:text-white"
              aria-label={`Download ${item.filename}`}
              title="Download"
            >
              <IconArrowRight />
            </a>
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={`Edit details of ${item.filename}`}
              title="Edit details"
              className="grid size-9 place-items-center rounded text-white/85 hover:bg-white/15 hover:text-white"
            >
              <IconPen />
            </button>
            <button
              type="button"
              onClick={() => { ref.current?.close(); onDelete(item); }}
              aria-label={`Delete ${item.filename}`}
              title="Delete"
              className="grid size-9 place-items-center rounded text-white/85 hover:bg-err-fill hover:text-white"
            >
              <IconClose />
            </button>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
            {items.length > 1 && (
              <>
                <ArrowButton side="left" onClick={() => step(-1)} label="Previous file" />
                <ArrowButton side="right" onClick={() => step(1)} label="Next file" />
              </>
            )}

            {/*
              A plain <img>, deliberately.

              next/image wants to optimise and size a picture it will show once
              at whatever the viewport happens to be — there is no layout to
              reserve here and no repeat visit to cache for. `object-contain`
              is what makes a portrait and a landscape both fit without either
              being cropped, which is the whole job of this screen.
            */}
            {item.is_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={item.alt_text ?? ""}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="rounded-lg border border-white/20 bg-black/40 px-6 py-8 text-center">
                <p className="text-[15px] font-semibold">{item.filename}</p>
                <p className="mt-1 text-[13px] text-white/70">
                  {item.mime} — no preview for this type.
                </p>
                <a
                  href={item.download_url}
                  className="mt-4 inline-block rounded border border-white/30 px-3.5 py-2 text-[13px] font-semibold hover:bg-white/15"
                >
                  Download it
                </a>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-center gap-3 border-t border-white/15 bg-black/55 px-3 py-2 text-[12.5px]">
            {/*
              The counter is what makes the arrows legible as a sequence rather
              than as two buttons — and it is what stops the wrap at the end
              feeling like a glitch.
            */}
            <span className="rounded bg-white/15 px-2 py-1 font-medium tabular-nums">
              {index! + 1} of {items.length}
            </span>
            {item.width && item.height && (
              <span className="text-white/70 tabular-nums">{item.width} x {item.height}</span>
            )}
            <span className="text-white/70">{formatSize(item.size)}</span>
          </footer>
        </div>
      )}
    </dialog>
  );
}

function ArrowButton({
  side, onClick, label,
}: {
  side: "left" | "right";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
        "bg-black/45 text-white/90 hover:bg-black/70 hover:text-white",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      {/* One chevron, rotated. Two icons for one shape is two things to keep
          in step the next time the set is restyled. */}
      <IconChevronDown className={cn("size-5", side === "left" ? "rotate-90" : "-rotate-90")} />
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
