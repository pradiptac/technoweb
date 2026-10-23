"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconCheck } from "@/components/icons-ui";

/**
 * A secret — a webhook's signing secret, an API key — shown the one time the
 * API hands it over.
 *
 * `warn` and not dismissible: this is the only place the value will ever be
 * readable, and an alert that can be closed by reflex is how somebody ends
 * up rotating it five minutes later. The copy is the same shape as
 * `CopyLink` — the glyph swaps to a tick and a live region says so — and a
 * refused clipboard (an insecure origin, an embedded browser) is reported
 * rather than ticked past; the value is still on screen to select by hand.
 */
export function SecretOnce({
  secret, name, label = "signing secret", lost = "rotate it from the form and update the other end",
}: {
  secret: string;
  name?: string;
  /** What the value is called in the heading: "signing secret", "API key". */
  label?: string;
  /** What to do when it is lost, finishing "if it is lost, …". */
  lost?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setState("done");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Alert tone="warn" dismissible={false} title={name ? `${name}'s ${label} — shown once` : `${label[0].toUpperCase()}${label.slice(1)} — shown once`}>
      <p className="mb-2">
        Save it where it is needed now. It cannot be
        read back; if it is lost, {lost}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 break-all rounded border border-line-strong bg-card px-2.5 py-1.5 font-mono text-13 text-ink select-all">
          {secret}
        </code>
        <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label={state === "done" ? "Copied" : `Copy the ${label}`}>
          {state === "done" ? <><IconCheck className="size-3.5" aria-hidden /> Copied</> : "Copy"}
        </Button>
        <span role="status" className="sr-only">
          {state === "done" ? "Copied to the clipboard." : state === "failed" ? "It could not be copied. Select it and copy by hand." : ""}
        </span>
      </div>
      {state === "failed" && (
        <p className="mt-2 text-12-5">The clipboard refused — select the value and copy it by hand.</p>
      )}
    </Alert>
  );
}
