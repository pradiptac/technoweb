import { useCallback, useEffect, useState } from "react";

export type SaveMessage = { tone: "ok" | "err"; text: string };

/**
 * `{dirty, saving, message}` for a screen that saves through a function
 * rather than a `<form>` — the menu builder and the campaign editor, which
 * both carried this exact trio, the same `{tone, text}` message shape and the
 * same `beforeunload` guard, written twice.
 *
 * `touch()` is what every edit calls: it marks the screen dirty and clears
 * the last outcome, because "Saved." beside a change made since is a lie.
 * `run()` wraps the save so `saving` cannot be left true by a throw — the
 * media uploader's try/finally lesson — and reads the action's `{error}` the
 * way every action here reports one.
 *
 * The guard is honest about its reach: `beforeunload` cannot see an in-app
 * navigation, so a sidebar link still discards the screen without asking —
 * the limitation `FormActions` documents for forms.
 */
export function useSaveStatus() {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = useCallback(() => {
    setDirty(true);
    setMessage(null);
  }, []);

  const run = useCallback(async (
    save: () => Promise<{ error?: string | null } | void>,
    saved: string,
  ) => {
    setSaving(true);
    setMessage(null);
    try {
      const outcome = await save();
      if (outcome?.error) setMessage({ tone: "err", text: outcome.error });
      else { setMessage({ tone: "ok", text: saved }); setDirty(false); }
    } finally {
      setSaving(false);
    }
  }, []);

  return { dirty, saving, message, touch, run, setMessage, setDirty };
}
