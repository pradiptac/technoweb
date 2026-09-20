"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Alert } from "@/components/ui/input";
import type { NewsletterReport } from "@/types/api";
import { resendCampaignAction } from "../actions";

/**
 * "Resend to people who did not open" — the panel on a sent campaign's report.
 *
 * One resend per campaign, so the panel has two states and no third: the
 * form while there has been none, and a link to the resend's own report once
 * there has. The count is the report's `non_openers` — delivered and never
 * opened — and is honest about being an upper bound: eligibility (somebody
 * who unsubscribed or bounced since) takes its share on the server, and the
 * new campaign's report says how many it actually went to.
 *
 * The subject is a new line, not the old one, because the people being
 * written to are exactly the ones the old line did not move; it starts as
 * the original so a resend is one edit rather than a blank field.
 */
export function ResendPanel({ report }: { report: NewsletterReport }) {
  const [state, action, pending] = useActionState(resendCampaignAction, {});
  const { campaign, counts, resend } = report;

  if (campaign.status !== "sent") return null;

  return (
    <Card as="section" interactive={false} padding="none" className="mb-5 p-3.5">
      <h2 className="mb-1 text-13 font-semibold">Resend to people who did not open</h2>

      {resend ? (
        <p className="measure text-12-5 text-muted">
          Resent as{" "}
          <Link href={`/admin/newsletter/campaigns/${resend.id}/report`} className="font-semibold text-brand-ink underline">
            {resend.name}
          </Link>{" "}
          to {resend.recipient_count.toLocaleString()} {resend.recipient_count === 1 ? "person" : "people"}.
          A campaign is resent once; send it again by duplicating it.
        </p>
      ) : (
        <>
          <p className="measure mb-2.5 text-12-5 text-muted">
            {counts.non_openers.toLocaleString()} {counts.non_openers === 1 ? "person" : "people"} received this
            and did not open it. A resend goes to them under a new subject line, skipping anyone who has
            unsubscribed, bounced or been suppressed since — and only once, so the same people are not
            written to a third time.
          </p>

          {state.error && <Alert tone="err" title="Not resent">{state.error}</Alert>}

          <Form action={action} state={state} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={campaign.id} />
            <Field label="New subject" htmlFor="resend-subject" variant="float" className="mb-0">
              <Input id="resend-subject" name="subject" defaultValue={campaign.subject} required maxLength={190} />
            </Field>
            <Button type="submit" size="sm" pending={pending} disabled={counts.non_openers === 0}>
              {pending ? "Sending…" : "Resend now"}
            </Button>
          </Form>
        </>
      )}
    </Card>
  );
}
