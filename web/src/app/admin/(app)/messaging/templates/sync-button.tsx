"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { syncMessageTemplatesAction, type MessagingFormState } from "../actions";

/**
 * Read every template's approval back from the provider. A press rather than
 * a form, because it writes no field on this screen — it asks WhatsApp.
 */
export function SyncButton({ channel, label }: { channel: string; label: string }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<MessagingFormState>({});

  return (
    <>
      <Button type="button" size="sm" variant="secondary" pending={busy}
        onClick={() => start(async () => setResult(await syncMessageTemplatesAction(channel)))}>
        {busy ? "Syncing…" : `Sync ${label} approvals`}
      </Button>
      {result.error && <Alert tone="err" title="Sync did not work">{result.error}</Alert>}
      {result.ok && <Alert tone="ok" title="Synced">{result.ok}</Alert>}
    </>
  );
}
