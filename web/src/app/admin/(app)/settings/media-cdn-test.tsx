"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { testMediaCdnAction, type IntegrationActionState } from "./integrations-actions";

/**
 * "Test the CDN" under the media CDN's two rows (0.124.0, docs/cdn.md).
 *
 * One real request, made by the API: a file from the library fetched
 * through the *saved* address and compared with the copy on the server. It
 * works with the switch off, because testing is what comes before sending
 * visitors there. The result stays on screen (`dismissible={false}`) — in
 * the console a dismissible outcome becomes a toast and is gone before it is
 * read, and this one names what to fix at the CDN.
 */
export function MediaCdnTest({ configured }: { configured: boolean }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<IntegrationActionState>({});

  return (
    <div className="mb-6 mt-2 border-y border-line py-4 sm:col-span-2">
      {result.error && <Alert tone="err" title="The CDN did not serve the file" dismissible={false}>{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="The CDN is working" dismissible={false}>{result.ok}</Alert>}

      <Button
        type="button" variant="secondary" size="sm" disabled={busy || !configured}
        onClick={() => start(async () => setResult(await testMediaCdnAction()))}
      >
        {busy ? "Asking the CDN…" : "Test the CDN"}
      </Button>
      <p className="measure mt-2 text-12-5 text-muted">
        {configured
          ? "Fetches one file from your media library through the saved address — not what is on screen, so save first — and checks it is the same file this server holds. It works whether or not the switch above is on."
          : "Save the CDN’s address first."}
      </p>
    </div>
  );
}
