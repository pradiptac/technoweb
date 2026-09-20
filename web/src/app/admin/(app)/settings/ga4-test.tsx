"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { testGa4Action, type IntegrationActionState } from "./integrations-actions";

/**
 * Google Analytics 4 — the `GscTest` control, mirrored.
 *
 * The same service account reads both, so there is no second key to
 * paste: the group is the property id above, a note saying the account
 * has to be added to the property as a Viewer, the last refusal the
 * overview's own reads recorded (`ga4_error`, the `mail_error` pattern —
 * a credential revoked in June fails silently everywhere else), and one
 * real report to prove the property answers. Read only; nothing here
 * writes to Google.
 */
export function Ga4Test({ configured, lastError }: { configured: boolean; lastError: string | null }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<IntegrationActionState>({});

  return (
    <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
      <h2 className="text-13 font-semibold">Google Analytics 4</h2>
      <p className="measure mt-1 mb-3 text-12-5 text-muted">
        Uses the Search Console service account above — add its email to the GA4 property as a Viewer.
        Nothing is written to Google; the overview and the store dashboard only read.
      </p>

      {lastError && !result.ok && !result.error && (
        <Alert tone="err" title="Google Analytics refused the last read" dismissible={false}>{lastError}</Alert>
      )}
      {result.error && <Alert tone="err" title="Google refused the property">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="The property answers">{result.ok}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button" variant="secondary" size="sm" disabled={busy || !configured}
          onClick={() => start(async () => setResult(await testGa4Action()))}
        >
          {busy ? "Asking Google…" : "Test the connection"}
        </Button>
        <p className="measure text-12-5 text-muted">
          {configured
            ? "Uses whatever is saved, not what is on screen — so save first. One report for yesterday; nothing is written."
            : "Save the service account key and a property id first."}
        </p>
      </div>
    </div>
  );
}
