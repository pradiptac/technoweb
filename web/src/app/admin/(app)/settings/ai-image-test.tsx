"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { testAiImageAction, type IntegrationActionState } from "./integrations-actions";

/**
 * Prove the picture model answers (0.184.0): one small square picture through
 * the saved key and model, counted against the day's cap and thrown away.
 * `type="button"`: it stands inside the settings form, and it tests what is
 * saved, not what is on screen.
 */
export function AiImageTest() {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<IntegrationActionState>({});

  return (
    <div className="mb-6 sm:col-span-2">
      {result.error && <Alert tone="err" nonce={result} title="The model could not make a picture">{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" nonce={result} title="The model answered">{result.ok}</Alert>}
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => start(async () => setResult(await testAiImageAction()))}>
        {busy ? "Making a test picture…" : "Test this model"}
      </Button>
      <p className="measure mt-2 text-12-5 text-muted">Makes one small picture with the saved key and model, so save first. It counts as one of the day’s pictures.</p>
    </div>
  );
}
