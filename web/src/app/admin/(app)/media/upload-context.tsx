"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { UploadProgress } from "@/components/ui/file-drop";
import { uploadMediaAction } from "./actions";

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
 * Uploads run one at a time rather than in parallel. A server action per file
 * is a round trip that also revalidates the page, and firing twenty at once
 * makes the count meaningless, hides which one failed, and pushes twenty
 * revalidations through at the same moment. Sequential means "3 of 7" is true
 * when it is displayed, and a failure names the file that caused it.
 */
export function UploadProvider({ folderId, children }: { folderId?: string; children: ReactNode }) {
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
        try/finally, because a *thrown* action wedges this permanently.

        `uploadMediaAction` calls `redirect()` on a 401 — and `redirect()`
        works by throwing. Without this the rejection escapes, `busy.current`
        stays true and `progress` stays set, so the bar sticks and every later
        upload returns at the guard above having done nothing and said nothing.
        The session expiring turned the uploader off until the page was
        reloaded, with no message to explain it.
      */
      try {
        // Starts at zero done, so the bar is empty until something has
        // actually finished rather than a fifth full the instant it appears.
        setProgress({ done: 0, total: files.length, label: files[0]?.name });

        for (const [i, file] of files.entries()) {
          setProgress({ done: i, total: files.length, label: file.name });

          const data = new FormData();
          data.append("file", file);
          // Uploads land where you are looking. "unfiled" is a view rather
          // than a folder, so it carries no id.
          if (folderId && folderId !== "unfiled") data.append("folder_id", folderId);

          const result = await uploadMediaAction({}, data);
          if (result.error) failed.push(`${file.name} — ${result.error}`);

          // Counted whether it succeeded or failed: this measures how far
          // through the batch we are, not how much of it worked. The outcome
          // below is what reports the failures.
          setProgress({ done: i + 1, total: files.length, label: file.name });
        }
      } catch {
        /*
          A *thrown* action, as opposed to one that returned an error.

          `redirect()` throws by design, and so does exceeding the Server
          Action body limit — which used to leave this with nothing to say at
          all: the throw escaped, the code that builds the outcome never ran,
          and the screen reported neither success nor failure. Whatever the
          cause, the person who pressed the button gets a sentence.
        */
        failed.push(
          "That upload did not complete. If the file is large, try a smaller one — "
          + "and if it keeps happening, reload the page and sign in again.",
        );
      } finally {
        // Always, whatever happened. These two are what let the next upload
        // start at all.
        setProgress(null);
        busy.current = false;
      }

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
  }, [folderId]);

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
