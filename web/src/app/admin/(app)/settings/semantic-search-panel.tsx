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
const NUMBER = new Intl.NumberFormat("en-IN");

export function SemanticSearchPanel() {
  const [status, setStatus] = useState<SemanticStatus | null>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<SemanticActionState>({});
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let live = true;
    void semanticStatusAction().then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, []);

  const run = (action: () => Promise<SemanticActionState>) =>
    start(async () => {
      setResult(await action());
      // A failed re-read keeps the last good numbers and says so beside them.
      const next = await semanticStatusAction();
      if (next) setStatus(next);
      setStale(!next);
    });

  return (
    <div className="mb-6 mt-2 border-y border-line py-4 sm:col-span-2">
      {status?.error && <Alert tone="err" title="OpenRouter refused the last request" dismissible={false}><span className="[overflow-wrap:anywhere]">{status.error}</span></Alert>}
      {result.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="Done">{result.ok}</Alert>}

      {status ? (
        <ul className="mb-3 space-y-1 text-13 text-ink-2">
          <li className="[overflow-wrap:anywhere]">{status.enabled ? "Switched on" : "Switched off"} · {status.model}</li>
          <li>{NUMBER.format(status.passages.embedded)} of {NUMBER.format(status.passages.total)} passages indexed, {NUMBER.format(status.passages.waiting)} waiting.</li>
          <li>Today: {NUMBER.format(status.today.phrases)} of {NUMBER.format(status.today.cap)} new phrases.</li>
          <li>Last full index: {formatDate(status.last_index_at, "dateTime", "not yet")}{status.indexing && " — indexing now"}</li>
          {stale && <li className="text-warn">The status could not be refreshed; these numbers may be out of date.</li>}
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
