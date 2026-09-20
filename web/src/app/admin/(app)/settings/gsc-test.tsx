"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { testGscAction, type IntegrationActionState } from "./integrations-actions";

/**
 * "Does Google let this account in?" — one real Search Console query, and
 * Google's own words on a refusal, which is what says whether the account
 * was ever added to the property. The last refusal recorded by the
 * overview's own reads is shown too (`gsc_error`, the `mail_error`
 * pattern), because a credential that worked in March and was revoked in
 * June fails silently everywhere else.
 */
export function GscTest({ configured, lastError }: { configured: boolean; lastError: string | null }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<IntegrationActionState>({});

  return (
    <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
      {lastError && !result.ok && !result.error && (
        <Alert tone="warn" title="Search Console refused the last read" dismissible={false}>{lastError}</Alert>
      )}
      {result.error && <Alert tone="err" title="Google refused the account">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="The account works">{result.ok}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button" variant="secondary" size="sm" disabled={busy || !configured}
          onClick={() => start(async () => setResult(await testGscAction()))}
        >
          {busy ? "Asking Google…" : "Test the Search Console account"}
        </Button>
        <p className="measure text-12-5 text-muted">
          {configured
            ? "Uses whatever is saved, not what is on screen — so save first. One query over the last 28 days; nothing is written."
            : "Save a service account key first."}
        </p>
      </div>
    </div>
  );
}
