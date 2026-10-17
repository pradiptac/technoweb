"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import type { SemanticStatus } from "@/types/semantic-search";
import { semanticReindexAction, semanticStatusAction, semanticTestAction, type SemanticActionState } from "./semantic-search-actions";

/**
 * Where search by meaning stands, from the screen its switch is on
 * (0.182.0, docs/semantic-search.md): how much is indexed, what is waiting,
 * today's new phrases against the cap, OpenRouter's last refusal, and the two
 * buttons. `type="button"`: it stands inside the settings form. Both buttons
 * use what is saved, not what is on screen.
 */
export function SemanticSearchPanel() {
  const [status, setStatus] = useState<SemanticStatus | null>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<SemanticActionState>({});

  useEffect(() => {
    let live = true;
    void semanticStatusAction().then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, []);

  const run = (action: () => Promise<SemanticActionState>) =>
    start(async () => {
      setResult(await action());
      setStatus(await semanticStatusAction());
    });

  return (
    <div className="mb-6 mt-2 border-y border-line py-4 sm:col-span-2">
      {status?.error && <Alert tone="err" title="OpenRouter refused the last request" dismissible={false}>{status.error}</Alert>}
      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="Done">{result.ok}</Alert>}

      {status ? (
        <ul className="mb-3 space-y-1 text-13 text-ink-2">
          <li>{status.enabled ? "Switched on" : "Switched off"} · {status.model}</li>
          <li>{status.passages.embedded.toLocaleString("en-IN")} passages indexed, {status.passages.waiting.toLocaleString("en-IN")} waiting.</li>
          <li>Today: {status.today.phrases.toLocaleString("en-IN")} of {status.today.cap.toLocaleString("en-IN")} new phrases.</li>
          <li>Last full index: {formatDate(status.last_index_at, "dateTime", "not yet")}</li>
        </ul>
      ) : (
        <p className="mb-3 text-13 text-muted">Reading the status…</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => run(semanticTestAction)}>
          {busy ? "Working…" : "Test this model"}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => run(semanticReindexAction)}>
          Re-index now
        </Button>
      </div>
      <p className="measure mt-2 text-12-5 text-muted">
        Test sends one short request through the saved OpenRouter key. Re-index reads every page again in the background — save first if you changed the model.
      </p>
    </div>
  );
}
