"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { submitEnquiryAction, type EnquiryState } from "./enquiry-actions";

const initial: EnquiryState = {};

export function EnquiryForm({
  source = "contact",
  subject,
  compact = false,
}: { source?: string; subject?: string; compact?: boolean }) {
  const [state, formAction, pending] = useActionState(submitEnquiryAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  if (state.ok) {
    return (
      <Alert tone="ok" title="Message sent">
        Thanks — we have it. Someone from the engineering team will come back to you within
        one working day. If it is urgent, call the number above instead.
      </Alert>
    );
  }

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="source" value={source} />
      {subject && <input type="hidden" name="subject" value={subject} />}

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && <Alert tone="err" title="Could not send">{state.error}</Alert>}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" required autoComplete="name" aria-invalid={Boolean(err("name"))} />
        </Field>
        <Field label="Work email" htmlFor="email" error={err("email")}>
          <Input id="email" name="email" type="email" required autoComplete="email" aria-invalid={Boolean(err("email"))} />
        </Field>
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="company" error={err("company")}>
          <Input id="company" name="company" autoComplete="organization" aria-invalid={Boolean(err("company"))} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(err("phone"))} />
        </Field>
      </div>

      {!compact && !subject && (
        <Field label="Subject" htmlFor="subject" error={err("subject")}>
          <Input id="subject" name="subject" />
        </Field>
      )}

      <Field
        label="What do you need?"
        htmlFor="message"
        error={err("message")}
        hint="Rough site size, what you have now, and what is prompting the change — enough for an engineer to come back with something useful rather than a brochure."
      >
        <Textarea id="message" name="message" rows={compact ? 4 : 6} required aria-invalid={Boolean(err("message"))} />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}
