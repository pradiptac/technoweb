"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useUploadForm } from "@/lib/hooks/use-upload-form";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Select, Textarea } from "@/components/ui/input";
import { FileDrop } from "@/components/ui/file-drop";
import { replyAction, type ReplyState } from "./actions";
import type { CannedReply } from "@/types/api";

const initial: ReplyState = {};

/**
 * `savedReplies` arrive already filled for this ticket — the page fetched
 * them through `getTicketCannedReplies`, and the API did the filling. This
 * component pastes text; it never sees a placeholder and never fetches.
 */
export function ReplyForm({ reference, savedReplies = [] }: { reference: string; savedReplies?: CannedReply[] }) {
  const router = useRouter();
  // Through the Server Action until there is a file, then through a watched
  // request so the attachments show a percentage — see `useUploadForm`.
  const { state, formAction, pending, progress, onSubmitCapture } = useUploadForm<ReplyState>({
    action: replyAction,
    initial,
    url: `/api/admin/tickets/${encodeURIComponent(reference)}/reply`,
    prepare: renameAttachments,
    loginPath: "/admin/login",
    onSuccess: useCallback(() => { router.refresh(); return { ok: true } as ReplyState; }, [router]),
  });
  const [internal, setInternal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Insert the chosen reply at the cursor — or append, when the box has
   * never been focused — and put the picker back to its prompt, so the
   * same reply can be inserted twice and the select never claims a value
   * the textarea does not hold. Written through the prototype's setter and
   * an `input` event, the way `form-draft.tsx` restores a field, so anything
   * listening to the textarea sees the change as if it had been typed.
   */
  function insertSavedReply(e: ChangeEvent<HTMLSelectElement>) {
    const id = Number(e.target.value);
    const reply = savedReplies.find((r) => r.id === id);
    const box = bodyRef.current;
    e.target.value = "";
    if (!reply || !box) return;

    // A textarea that has never been focused reports a caret at 0, which
    // would put the reply in front of whatever is already typed.
    const touched = box.selectionStart > 0 || box.selectionEnd > 0 || box.value === "";
    const start = touched ? box.selectionStart : box.value.length;
    const end = touched ? box.selectionEnd : box.value.length;
    const before = box.value.slice(0, start);
    const after = box.value.slice(end);
    const glue = before && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${glue}${reply.body}${after}`;

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(box, next);
    else box.value = next;
    box.dispatchEvent(new Event("input", { bubbles: true }));

    const caret = start + glue.length + reply.body.length;
    box.focus();
    box.setSelectionRange(caret, caret);
  }

  // Clear the box once the reply has actually landed, so a slow connection
  // never looks like the message was lost.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Form ref={formRef} action={formAction} state={state} onSubmitCapture={onSubmitCapture} noValidate>
      <input type="hidden" name="reference" value={reference} />

      {state.error && <Alert tone="err" title="Reply not sent">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title={internal ? "Internal note saved" : "Reply sent"}>
          {internal ? "Only staff can see this note." : "The customer will see this reply."}
        </Alert>
      )}

      {savedReplies.length > 0 && (
        <Field label="Insert saved reply" htmlFor="saved-reply" variant="float-static"
          hint="Pasted at the cursor, already filled in for this ticket and this customer. Edit it before sending.">
          <Select id="saved-reply" defaultValue="" onChange={insertSavedReply}>
            <option value="">Choose a saved reply…</option>
            {savedReplies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Message" htmlFor="body" error={state.fieldErrors?.body?.[0]}>
        <Textarea ref={bodyRef} id="body" name="body" rows={4} required
          aria-invalid={Boolean(state.fieldErrors?.body)} />
      </Field>

      <Field label="Attachments" htmlFor="reply-attachments"
        hint="PNG, JPG, GIF or WebP images, PDF, or a plain text, log or CSV file. Up to 5 files, 10 MB each." error={state.fieldErrors?.attachments?.[0]} variant="above">
        <FileDrop
          id="reply-attachments"
          name="attachments"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv"
          label="Select files…"
          progress={progress}
        />
      </Field>

      <label className="mb-[18px] flex items-center gap-2 text-13-5">
        <input
          type="checkbox"
          name="is_internal"
          value="1"
          checked={internal}
          onChange={(e) => setInternal(e.target.checked)}
        />
        Internal note — not visible to the customer
      </label>

      <Button type="submit" variant={internal ? "secondary" : "primary"} pending={pending}>
        {pending ? "Sending…" : internal ? "Save internal note" : "Send reply to customer"}
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
