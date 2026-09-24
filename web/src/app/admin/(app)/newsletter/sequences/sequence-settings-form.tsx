"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { Field, Input, Select, Alert } from "@/components/ui/input";
import type { NewsletterGroup, NewsletterSequence } from "@/types/api";
import { createSequenceAction, saveSequenceAction } from "../actions";

/**
 * A sequence's own fields: its name, what triggers it, and who it comes
 * from. One form for the new screen and the Settings tab, keyed by whether
 * there is a sequence yet — creating redirects to the Steps tab, since a
 * sequence with no steps enrols nobody and that is the next thing to do.
 *
 * The sender lives here rather than on each step, and is copied onto every
 * step campaign when it is saved: the step is what the message is built
 * from, but a series that changes its From address halfway through reads as
 * two senders.
 */
export function SequenceSettingsForm({
  sequence, groups,
}: {
  sequence: NewsletterSequence | null;
  groups: NewsletterGroup[];
}) {
  const [state, action, pending] = useActionState(sequence ? saveSequenceAction : createSequenceAction, {});

  return (
    <Form action={action} state={state} className="grid gap-2.5">
      {sequence && <input type="hidden" name="id" value={sequence.id} />}

      {state.error && <Alert tone="err" title={sequence ? "Not saved" : "Not created"}>{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title={state.ok} />}

      <Field label="Name" htmlFor="name" variant="float"
        hint="For you, not for readers — each step has its own subject line.">
        <Input id="name" name="name" defaultValue={sequence?.name ?? ""} required maxLength={190} />
      </Field>

      <Field label="Enrol when somebody" htmlFor="newsletter_group_id" variant="float-static"
        hint="Joining the group enrols them; with no group, every new subscriber is enrolled whichever group they arrive in. Either way, once per person, ever.">
        <Select id="newsletter_group_id" name="newsletter_group_id" defaultValue={sequence?.newsletter_group_id ?? ""}>
          <option value="">Subscribes (any group, or none)</option>
          {groups.map((g) => <option key={g.id} value={g.id}>Joins {g.name}</option>)}
        </Select>
      </Field>

      <section className="border-t border-line pt-3">
        <h2 className="mb-1 text-13 font-semibold">Who it comes from</h2>
        <p className="measure mb-2 text-12-5 text-muted">
          Applied to every step. Leave blank to use the site&rsquo;s configured sender; an address must
          be one your mail provider is authorised to send as.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="From name" htmlFor="from_name" variant="float">
            <Input id="from_name" name="from_name" defaultValue={sequence?.from_name ?? ""} maxLength={120} />
          </Field>
          <Field label="From address" htmlFor="from_email" variant="float">
            <Input id="from_email" name="from_email" type="email" defaultValue={sequence?.from_email ?? ""} maxLength={190} />
          </Field>
        </div>
        <Field label="Reply-to" htmlFor="reply_to" variant="float" hint="Where replies go, if not the From address.">
          <Input id="reply_to" name="reply_to" type="email" defaultValue={sequence?.reply_to ?? ""} maxLength={190} />
        </Field>
      </section>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : sequence ? "Save settings" : "Create and add steps"}
        </Button>
      </FormActions>
    </Form>
  );
}
