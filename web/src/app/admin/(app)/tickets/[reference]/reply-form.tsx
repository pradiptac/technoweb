"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { FileDrop } from "@/components/ui/file-drop";
import { replyAction, type ReplyState } from "./actions";

const initial: ReplyState = {};

export function ReplyForm({ reference }: { reference: string }) {
  const [state, formAction, pending] = useActionState(replyAction, initial);
  const [internal, setInternal] = useState(false);
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
      {state.ok && !state.error && (
        <Alert tone="ok" title={internal ? "Internal note saved" : "Reply sent"}>
          {internal ? "Only staff can see this note." : "The customer will see this reply."}
        </Alert>
      )}

      <Field label="Message" htmlFor="body" error={state.fieldErrors?.body?.[0]}>
        <Textarea id="body" name="body" rows={4} required
          aria-invalid={Boolean(state.fieldErrors?.body)} />
      </Field>

      <Field label="Attachments" htmlFor="reply-attachments"
        hint="Up to 5 files, 10 MB each." error={state.fieldErrors?.attachments?.[0]} variant="above">
        <FileDrop
          id="reply-attachments"
          name="attachments"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv"
          label="Select files…"
        />
      </Field>

      <label className="mb-[18px] flex items-center gap-2 text-[13.5px]">
        <input
          type="checkbox"
          name="is_internal"
          value="1"
          checked={internal}
          onChange={(e) => setInternal(e.target.checked)}
        />
        Internal note — not visible to the customer
      </label>

      <Button type="submit" variant={internal ? "secondary" : "primary"} disabled={pending}>
        {pending ? "Sending…" : internal ? "Save internal note" : "Send reply to customer"}
      </Button>
    </form>
  );
}
