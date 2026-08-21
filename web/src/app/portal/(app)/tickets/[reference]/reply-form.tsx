"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { replyAction, type ReplyState } from "./actions";

const initial: ReplyState = {};

export function ReplyForm({ reference }: { reference: string }) {
  const [state, formAction, pending] = useActionState(replyAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box once the reply has actually landed, so a slow connection
  // never looks like the message was lost.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} noValidate>
      <input type="hidden" name="reference" value={reference} />

      {state.error && <Alert tone="err" title="Reply not sent">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title="Reply sent">The engineer on this ticket has been notified.</Alert>}

      <Field label="Add a reply" htmlFor="body" error={state.fieldErrors?.body?.[0]}>
        <Textarea id="body" name="body" rows={4} required
          aria-invalid={Boolean(state.fieldErrors?.body)} />
      </Field>

      <Field label="Attachments" htmlFor="reply-attachments"
        hint="Up to 5 files, 10 MB each." error={state.fieldErrors?.attachments?.[0]} variant="above">
        <Input id="reply-attachments" name="attachments" type="file" multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv" />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}
