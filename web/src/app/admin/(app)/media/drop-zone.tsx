"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useUpload } from "./upload-context";

/**
 * Drop files anywhere on the library to upload them.
 *
 * Two details that are easy to get wrong and obvious once wrong:
 *
 * `dragenter` and `dragleave` fire again for every child element the pointer
 * crosses, so a boolean flickers the overlay on and off as the cursor moves
 * over the tiles. A depth counter is what makes it stable — the overlay goes
 * away when the count returns to zero, which is when the pointer has actually
 * left the region.
 *
 * The overlay is only shown for a drag that carries files. Without the
 * `types` check, dragging a selection of text or a link from another tab
 * offers a drop target that would then do nothing.
 *
 * `preventDefault` on dragover is not optional: without it the browser's
 * default is to refuse the drop, and the file opens in the tab instead —
 * navigating away from the console mid-upload.
 */
export function DropZone({ children }: { children: ReactNode }) {
  const { upload, pending } = useUpload();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <div
      className="relative min-w-0"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        upload(e.dataTransfer.files);
      }}
    >
      {children}

      {/*
        aria-hidden and pointer-events-none: this is feedback for a mouse
        gesture that a keyboard or screen-reader user cannot start, and the
        file input in the toolbar is the route that works for everyone. An
        overlay that took pointer events would also swallow the drop it exists
        to announce.
      */}
      {over && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-lg",
            "border-2 border-dashed border-brand-500 bg-brand-50/90",
          )}
        >
          <p className="text-[15px] font-semibold text-brand-700">
            {pending ? "Still uploading…" : "Drop to upload"}
          </p>
        </div>
      )}
    </div>
  );
}
