"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import type { AdminEntry } from "@/types/api";
import { sendInvestorAlertAction } from "./actions";

/**
 * An investor document's email alert (docs/content-presets.md): whether it has
 * gone, why it was held back, and a button to send it now. Its own form, beside
 * the entry's — a form cannot sit inside another. The API sends once whatever
 * is pressed, so the button is offered only while nothing has gone.
 */
export function InvestorAlertPanel({ typeSlug, entry }: { typeSlug: string; entry: AdminEntry }) {
  const [state, action, pending] = useActionState(sendInvestorAlertAction, {});
  const sent = Boolean(entry.alert_sent_at) || Boolean(state.ok);
  const live = entry.status === "published" && (!entry.published_at || new Date(entry.published_at) <= new Date());

  return (
    <Card as="section" interactive={false} padding="lg" className="mt-8">
      <h2 className="text-16-5 font-semibold text-ink">Email alert</h2>

      {entry.alert_error && !state.ok ? (
        <Alert tone="warn" title="The alert was held back" dismissible={false}>
          {entry.alert_error} Fix it and save the document; the alert goes on the next run.
        </Alert>
      ) : null}

      {sent ? (
        <p className="mt-2 text-14 text-ink-2">
          {state.ok ?? <>Sent on {formatDate(entry.alert_sent_at, "dateTime")}.</>}{" "}
          {entry.alert_campaign_id ? (
            <Link href={`/admin/newsletter/campaigns/${entry.alert_campaign_id}`} className="font-semibold text-brand-ink underline">See who opened it</Link>
          ) : null}
        </p>
      ) : (
        <Form action={action} state={state} className="mt-2">
          <input type="hidden" name="type" value={typeSlug} />
          <input type="hidden" name="id" value={entry.id} />
          <p className="mb-4 text-14 text-ink-2">
            {live ? "Email the Investor updates list about this document now. It goes once." : "Publish the document first; an alert can only announce a document that is live."}
          </p>
          {state.error && <Alert tone="err" title="Not sent">{state.error}</Alert>}
          <Button type="submit" size="sm" pending={pending} disabled={!live}>Send alert now</Button>
        </Form>
      )}
    </Card>
  );
}
