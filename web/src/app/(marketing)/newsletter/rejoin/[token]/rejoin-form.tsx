"use client";

import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { rejoinAction } from "@/components/layout/newsletter-actions";

/**
 * One button that puts an address back on the newsletter.
 *
 * The press, not the page load, is the confirmation: see `page.tsx`. A dead
 * link gets one plain sentence whatever killed it — expired, used and undone,
 * or never real — because the difference is nobody's business but the
 * address's, and the fix is the same: sign up again for a fresh link.
 */
export function RejoinForm({
  token, email, valid, confirmed, company,
}: {
  token: string;
  email: string | null;
  /** Whether the API recognised the link at all. */
  valid: boolean;
  /** Already followed, and the address is still on the list. */
  confirmed: boolean;
  /** Whose newsletter it is — the install's company, from the server parent. */
  company: string;
}) {
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok || (valid && confirmed)) {
    return (
      <div>
        <Alert tone="ok" title="You are back on the list" dismissible={false}>
          {result?.ok ?? `You are subscribed to the ${company} newsletter again.`}
        </Alert>

        <p className="measure mt-4 text-15 text-muted">
          Every newsletter carries an unsubscribe link at the foot, as before.
        </p>

        <div className="mt-5">
          <ButtonLink href="/">Back to the website</ButtonLink>
        </div>
      </div>
    );
  }

  if (!valid || result?.error) {
    return (
      <div>
        <Alert tone="info" title="This link cannot be used" dismissible={false}>
          {result?.error ?? "That link is no longer valid."}
        </Alert>

        <p className="measure mt-4 text-15 text-muted">
          Links to rejoin last a few days and work once. To rejoin, sign up again with the form at
          the foot of any page and we will email you a fresh one.
        </p>

        <div className="mt-5">
          <ButtonLink href="/">Back to the website</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="measure text-15">
        {email
          ? <>Add <strong className="font-mono text-14">{email}</strong> back to the {company} newsletter?</>
          : <>Rejoin the {company} newsletter?</>}
      </p>

      <p className="measure mt-2 text-14 text-muted">
        You unsubscribed earlier. Nothing changes until you press the button below.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          pending={pending}
          onClick={() => start(async () => setResult(await rejoinAction(token)))}
        >
          {pending ? "Adding you back…" : "Yes, add me back"}
        </Button>

        <ButtonLink href="/" variant="secondary">No, leave me unsubscribed</ButtonLink>
      </div>
    </div>
  );
}
