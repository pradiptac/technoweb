"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { revealCodeAction } from "./actions";

type Revealed = {
  codes: { id: number; code: string }[];
  procedure: { html: string | null; pdf_url: string | null; pdf_name: string | null };
};

/**
 * The one screen in the product that shows a licence key.
 *
 * Behind a press rather than printed on load, and that is the whole design:
 * this page is addressed by a link somebody may leave open on a shared screen,
 * and every reveal is counted — "they say they never received it" against a row
 * saying it was shown three times is the whole of that conversation. It is a
 * POST for the same reason a GET would be pre-fetched, proxy-logged with its
 * URL and cached.
 *
 * The activation steps come back **with** the code rather than only by email:
 * this is the moment somebody is holding the key and deciding what to do with
 * it, and the message sent minutes ago is in another window. Both read the same
 * stored text, so the screen and the email cannot disagree about how to use the
 * same licence.
 */
export function RevealCode({
  orderNumber, token, itemId,
}: {
  orderNumber: string;
  token: string;
  itemId: number;
}) {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reveal() {
    setBusy(true);
    setMessage(null);

    try {
      const result = await revealCodeAction(orderNumber, token, itemId);

      if (result.ok) {
        setRevealed({ codes: result.codes, procedure: result.procedure });
      } else {
        setMessage(result.message);
      }
    } finally {
      // try/finally, because a thrown action would otherwise leave this button
      // disabled for ever and the only way out would be a reload — the trap the
      // media uploader documents.
      setBusy(false);
    }
  }

  if (revealed) {
    return (
      <div className="mt-3 rounded-lg border border-ok/25 bg-ok-soft p-4">
        <p className="mb-2 text-[12.5px] font-semibold text-ok">
          {revealed.codes.length === 1 ? "Your activation code" : "Your activation codes"}
        </p>

        <ul className="grid gap-2">
          {revealed.codes.map((c) => (
            <li key={c.id}>
              {/* Mono and selectable: this is copied, and a proportional font
                  makes 0 and O the same shape in a string somebody is retyping. */}
              <code className="block rounded-md border border-line-strong bg-card px-3 py-2 font-mono text-[14px] break-all select-all">
                {c.code}
              </code>
            </li>
          ))}
        </ul>

        {(revealed.procedure.html || revealed.procedure.pdf_url) && (
          <div className="mt-4 border-t border-ok/25 pt-3">
            <p className="mb-2 text-[12.5px] font-semibold">How to activate this</p>

            {revealed.procedure.html && (
              <Prose html={revealed.procedure.html} className="text-[13.5px]" />
            )}

            {revealed.procedure.pdf_url && (
              /* A plain anchor: this is a file on the media disk, not a route
                 in this application, and a `next/link` would prefetch it. */
              <a
                href={revealed.procedure.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[13px] text-brand-ink hover:underline"
              >
                {revealed.procedure.pdf_name ?? "Download the instructions"} (PDF)
              </a>
            )}
          </div>
        )}

        <p className="mt-3 text-[12px] text-muted">
          We record each time a code is shown. Keep it somewhere safe.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Button type="button" size="sm" onClick={reveal} disabled={busy}>
        {busy ? "Revealing…" : "Reveal activation code"}
      </Button>

      {message && (
        <div className="mt-3">
          <Alert tone="info" title="Not ready yet">
            {message}
          </Alert>
        </div>
      )}
    </div>
  );
}
