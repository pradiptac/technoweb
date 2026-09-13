"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { testHunterAction, type IntegrationActionState } from "./integrations-actions";

/**
 * Prove the saved Hunter key works, from the screen it was typed into.
 *
 * The mail panel's test button, for a different provider: `type="button"`
 * because it stands inside the settings form, and the result is Hunter's own
 * words on a refusal — "Invalid API key" says what to fix, "the key could not
 * be tested" says nothing. On success it shows what the plan has left, which
 * is the figure worth seeing before the nightly run spends any of it.
 */
export function HunterTest({ configured }: { configured: boolean }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<IntegrationActionState>({});

  return (
    <div className="mt-2 border-t border-line pt-4 sm:col-span-2">
      {result.error && <Alert tone="err" title="Hunter refused the key">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="The key works">{result.ok}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button" variant="secondary" size="sm" disabled={busy || !configured}
          onClick={() => start(async () => setResult(await testHunterAction()))}
        >
          {busy ? "Asking Hunter…" : "Test the Hunter key"}
        </Button>
        <p className="measure text-[12.5px] text-muted">
          {configured
            ? "Uses whatever is saved, not what is on screen — so save first. Free on the plan: it reads the account, not an address."
            : "Save a Hunter API key first."}
        </p>
      </div>
    </div>
  );
}
