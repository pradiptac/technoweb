"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { unsubscribeAction } from "../../actions";

/**
 * One button, no login, no "are you sure".
 *
 * The specification asks for exactly this, and it is also simply right: every
 * obstacle between somebody deciding to leave and leaving converts an
 * unsubscribe into a spam complaint, and a complaint costs the sending
 * domain far more than a lost subscriber does.
 *
 * A confirmation *after* the fact is fine — that is information. A
 * confirmation before it is a hurdle.
 */
export function UnsubscribeForm({
  token, email, already,
}: {
  token: string;
  email: string | null;
  already: boolean;
}) {
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <div>
        <Alert tone="ok" title="You have been unsubscribed">
          {result.ok}
        </Alert>

        <p className="measure mt-4 text-[15px] text-muted">
          You will still receive replies to anything you ask us directly, and anything about
          a support ticket or an order — those are not marketing.
        </p>

        <div className="mt-5">
          <ButtonLink href="/">Back to the website</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      {result?.error && <Alert tone="err" title="That did not work">{result.error}</Alert>}

      {already && (
        <Alert tone="info" title="This address is already unsubscribed">
          Nothing further is needed — you are not receiving our newsletter.
        </Alert>
      )}

      <p className="measure text-[15px]">
        {email
          ? <>Unsubscribe <strong className="font-mono text-[14px]">{email}</strong> from the Technoware newsletter?</>
          : <>Unsubscribe from the Technoware newsletter?</>}
      </p>

      <p className="measure mt-2 text-[14px] text-muted">
        You will stop receiving marketing emails. Replies to your own enquiries and anything
        about a support ticket are unaffected.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setResult(await unsubscribeAction(token)))}
        >
          {pending ? "Unsubscribing…" : "Yes, unsubscribe me"}
        </Button>

        <ButtonLink href="/" variant="secondary">Keep receiving them</ButtonLink>
      </div>

      <p className="measure mt-6 text-[13px] text-faint">
        Received this in error, or from somebody forwarding it? You can{" "}
        <Link href="/contact" className="underline">tell us</Link> and we will look into where
        the address came from.
      </p>
    </div>
  );
}
