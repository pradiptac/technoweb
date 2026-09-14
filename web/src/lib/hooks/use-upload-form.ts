"use client";

import { useActionState, useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { UploadProgress } from "@/components/ui/file-drop";
import { refusalMessage, uploadWithProgress } from "@/lib/upload-client";

/** The refusal shape every action in this codebase reports. */
type Refusal = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * A form that posts through its Server Action until it carries a file, and
 * through a watched request once it does.
 *
 * A Server Action gives the browser no progress events: an upload of five
 * 10MB screenshots is a spinner until it finishes or fails, and a
 * percentage animated on a timer is worse than none. But a Server Action is
 * also what gives every form here its refusal handling, its `Form`
 * value-restoration and its redirect on success — none of which a form
 * should lose to gain a progress bar. So this keeps both: `formAction` is
 * the action as before, and `onSubmitCapture` steps in only when the form
 * being submitted holds at least one non-empty file. Then the browser sends
 * the multipart body itself to `url` — a route handler that streams it to
 * the same API endpoint with the same session — reports bytes as they go,
 * and hands the answer to `onSuccess`, or maps a refusal onto the same
 * `{error, fieldErrors}` the action would have returned so the form does
 * not know which path it took.
 *
 * `prepare` runs on the FormData before it is sent, for what the action used
 * to do server-side: renaming `attachments` to `attachments[]`, dropping the
 * empty entry an untouched file input still submits.
 */
export function useUploadForm<S extends Refusal>({
  action, initial, url, prepare, onSuccess, loginPath, onRefusal,
}: {
  action: (prev: Awaited<S>, formData: FormData) => Promise<S>;
  initial: Awaited<S>;
  /** The route handler the watched request posts to. */
  url: string | ((form: FormData) => string);
  prepare?: (form: FormData) => void;
  /** The API's JSON on a 2xx. Redirect, refresh, reset — whatever the action did next. */
  onSuccess: (body: unknown) => Awaited<S> | void;
  /** Where a 401 sends people; the action's `redirect()` equivalent. */
  loginPath?: string;
  /** A status the form words itself — 429 on the public forms, say. Returning undefined falls through to the default. */
  onRefusal?: (status: number, body: unknown) => Awaited<S> | undefined;
}) {
  const router = useRouter();
  const [actionState, formAction, actionPending] = useActionState<S, FormData>(action, initial);
  const [local, setLocal] = useState<Awaited<S> | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const onSubmitCapture = useCallback((event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = [...data.values()].filter((v): v is File => v instanceof File && v.size > 0);

    // No file: the Server Action handles it, exactly as before.
    if (files.length === 0 || progress !== null) return;

    event.preventDefault();
    // Native validation still applies: a required field left blank is the
    // browser's refusal, not the API's, and it happens before any bytes go.
    if (!form.reportValidity()) return;

    prepare?.(data);
    setLocal(null);
    const total = files.reduce((n, f) => n + f.size, 0);
    const label = files.length === 1 ? files[0].name : `${files.length} files`;
    setProgress({ done: 0, total: 1, label, percent: 0 });

    void (async () => {
      try {
        const res = await uploadWithProgress<unknown>(typeof url === "function" ? url(data) : url, data, {
          onProgress: (loaded, bytes) => {
            const percent = bytes > 0 ? Math.min(100, Math.round((loaded / bytes) * 100)) : 0;
            setProgress({ done: 0, total: 1, label: `${label} — ${formatBytes(total)}`, percent });
          },
        });

        if (res.ok) {
          const next = onSuccess(res.body);
          if (next) setLocal(next);
          return;
        }

        if (res.status === 401 && loginPath) {
          router.push(loginPath);
          return;
        }

        const custom = onRefusal?.(res.status, res.body);
        if (custom) { setLocal(custom); return; }

        const body = res.body as { message?: string; errors?: Record<string, string[]> } | null;
        if (res.status === 422) {
          setLocal({ ...initial, error: body?.errors ? "Check the highlighted fields." : refusalMessage(body, "Check the form."), fieldErrors: body?.errors } as Awaited<S>);
          return;
        }
        if (res.status === 413) {
          setLocal({ ...initial, error: "That is more than the server accepts in one go. Try fewer or smaller files." } as Awaited<S>);
          return;
        }
        setLocal({ ...initial, error: refusalMessage(body, "We could not send that. Try again shortly.") } as Awaited<S>);
      } catch {
        setLocal({ ...initial, error: "The upload did not complete. Check your connection and try again — nothing was sent." } as Awaited<S>);
      } finally {
        setProgress(null);
      }
    })();
  }, [initial, url, prepare, onSuccess, loginPath, onRefusal, progress, router]);

  return {
    /** The most recent outcome from whichever path ran. */
    state: local ?? actionState,
    formAction,
    pending: actionPending || progress !== null,
    /** For the `FileDrop` inside the form, so the bar shows the bytes going out. */
    progress,
    onSubmitCapture,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
