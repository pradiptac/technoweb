"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUploadForm } from "@/lib/hooks/use-upload-form";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { FileDrop } from "@/components/ui/file-drop";
import { replyAction, type ReplyState } from "./actions";

const initial: ReplyState = {};

export function ReplyForm({ reference }: { reference: string }) {
  const router = useRouter();
  const { state, formAction, pending, progress, onSubmitCapture } = useUploadForm<ReplyState>({
    action: replyAction,
    initial,
    url: `/api/portal/tickets/${encodeURIComponent(reference)}/messages`,
    prepare: renameAttachments,
    loginPath: "/portal/login",
    // The thread is server-rendered; a refresh is what the action's
    // revalidatePath did. `ok` is what clears the box below.
    onSuccess: useCallback(() => { router.refresh(); return { ok: true } as ReplyState; }, [router]),
  });
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box once the reply has actually landed, so a slow connection
  // never looks like the message was lost.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Form ref={formRef} action={formAction} state={state} onSubmitCapture={onSubmitCapture} noValidate>
      <input type="hidden" name="reference" value={reference} />

      {state.error && <Alert tone="err" title="Reply not sent">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title="Reply sent">The engineer on this ticket has been notified.</Alert>}

      <Field label="Add a reply" htmlFor="body" error={state.fieldErrors?.body?.[0]}>
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
          progress={progress}
        />
      </Field>

      <Button type="submit" pending={pending}>
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </Form>
  );
}

/** The action's own reshaping of the form, for the watched path. */
function renameAttachments(data: FormData) {
  const files = data.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  data.delete("attachments");
  data.delete("reference");
  files.forEach((f) => data.append("attachments[]", f));
}
