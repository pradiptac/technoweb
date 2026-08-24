"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { uploadMediaAction } from "./actions";

type Outcome = { tone: "ok" | "err"; text: string };

type UploadApi = {
  upload: (files: FileList | File[]) => void;
  /** "3 of 7" while running, null otherwise. */
  progress: string | null;
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
  const [progress, setProgress] = useState<string | null>(null);
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

      for (const [i, file] of files.entries()) {
        setProgress(files.length > 1 ? `${i + 1} of ${files.length}` : file.name);

        const data = new FormData();
        data.append("file", file);
        // Uploads land where you are looking. "unfiled" is a view rather than
        // a folder, so it carries no id.
        if (folderId && folderId !== "unfiled") data.append("folder_id", folderId);

        const result = await uploadMediaAction({}, data);
        if (result.error) failed.push(`${file.name} — ${result.error}`);
      }

      setProgress(null);
      busy.current = false;

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
