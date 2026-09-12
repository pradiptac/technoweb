"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { UploadProgress } from "@/components/ui/file-drop";
import { uploadMediaFile } from "@/lib/media-upload";

type Outcome = { tone: "ok" | "err"; text: string };

type UploadApi = {
  upload: (files: FileList | File[]) => void;
  /**
   * Counts rather than a rendered string, so the bar and the label are built
   * from one number each. It was "3 of 7" as text, which a progress bar cannot
   * use without parsing back out what the producer already knew.
   */
  progress: UploadProgress | null;
  pending: boolean;
  message: Outcome | null;
};

const Ctx = createContext<UploadApi | null>(null);

/**
 * One upload routine, shared by the toolbar's file input and the drop zone
 * over the grid.
 *
 * They sit in different parts of the tree — one inside the filter row, one
 * wrapping the whole column — but they are the same action and must report
 * into the same place. Two copies of this state would mean dropping files
 * showed a result in one spot and choosing them showed it in another.
 *
 * Uploads run one at a time rather than in parallel. Firing twenty at once
 * makes the count meaningless, hides which one failed, and — now that each
 * one reports its own bytes — would turn one honest percentage into twenty
 * interleaved ones. Sequential means "3 of 7" is true when it is displayed,
 * the percentage is the file named beside it, and a failure names the file
 * that caused it.
 *
 * Through `uploadMediaFile` rather than a Server Action, which is the whole
 * of how the bar shows a percentage: the browser sends the request itself and
 * watches it go. The grid is refreshed once at the end of the batch, where
 * the action used to revalidate the page after every file.
 */
export function UploadProvider({ folderId, children }: { folderId?: string; children: ReactNode }) {
  const router = useRouter();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState<Outcome | null>(null);
  // A ref, not state: two drops in quick succession must not interleave, and
  // the guard has to be read synchronously at the top of the handler.
  const busy = useRef(false);

  const upload = useCallback((incoming: FileList | File[]) => {
    const files = Array.from(incoming);
    if (!files.length || busy.current) return;

    busy.current = true;
    setMessage(null);
    void (async () => {
      const failed: string[] = [];

      /*
        try/finally, because anything thrown here wedges this permanently.

        Without it a rejection escapes, `busy.current` stays true and
        `progress` stays set, so the bar sticks and every later upload returns
        at the guard above having done nothing and said nothing. That was the
        session expiring under a Server Action's `redirect()`; the uploader
        now throws a sentence instead, but the shape of the failure is the same.
      */
      try {
        // Starts at zero, so the bar is empty until something has actually
        // been sent rather than a fifth full the instant it appears.
        setProgress({ done: 0, total: files.length, label: files[0]?.name, percent: 0 });

        for (const [i, file] of files.entries()) {
          setProgress({ done: i, total: files.length, label: file.name, percent: 0 });

          try {
            await uploadMediaFile(file, {
              folderId,
              onProgress: (percent) => setProgress({ done: i, total: files.length, label: file.name, percent }),
            });
          } catch (error) {
            failed.push(`${file.name} — ${error instanceof Error ? error.message : "That upload failed."}`);
          }

          // Counted whether it succeeded or failed: this measures how far
          // through the batch we are, not how much of it worked. The outcome
          // below is what reports the failures.
          setProgress({ done: i + 1, total: files.length, label: file.name, percent: 0 });
        }
      } finally {
        // Always, whatever happened. These two are what let the next upload
        // start at all.
        setProgress(null);
        busy.current = false;
      }

      // The grid reads the library on the server; one refresh for the batch
      // is what the action's per-file `revalidatePath` used to do twenty times.
      router.refresh();

      const ok = files.length - failed.length;
      if (!failed.length) {
        setMessage({ tone: "ok", text: ok === 1 ? "1 file uploaded." : `${ok} files uploaded.` });
      } else if (!ok) {
        // One failure names itself; several would fill the toolbar, so the
        // first is shown and the rest are counted.
        setMessage({ tone: "err", text: failed.length === 1 ? failed[0] : `${failed.length} failed. ${failed[0]}` });
      } else {
        setMessage({ tone: "err", text: `${ok} uploaded, ${failed.length} failed. ${failed[0]}` });
      }
    })();
  }, [folderId, router]);

  return (
    <Ctx.Provider value={{ upload, progress, pending: progress !== null, message }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUpload(): UploadApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUpload must be used inside <UploadProvider>");
  return ctx;
}
