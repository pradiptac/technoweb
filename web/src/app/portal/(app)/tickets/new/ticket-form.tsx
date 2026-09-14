"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Form } from "@/components/ui/form";
import { useUploadForm } from "@/lib/hooks/use-upload-form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { FileDrop } from "@/components/ui/file-drop";
import { createTicketAction, type TicketFormState } from "./actions";
import type { TicketCategory } from "@/types/api";

const initial: TicketFormState = {};

const priorities = [
  { value: "low", label: "Low — no rush" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High — several people affected" },
  { value: "critical", label: "Critical — service is down" },
];

export function TicketForm({
  categories,
  defaultSubject = "",
}: { categories: TicketCategory[]; defaultSubject?: string }) {
  const router = useRouter();
  /*
    Through the Server Action until there is a file, then through a watched
    request so the bar under the attachments shows a real percentage — see
    `useUploadForm`. The success path is the action's: on to the ticket.
  */
  const { state, formAction, pending, progress, onSubmitCapture } = useUploadForm<TicketFormState>({
    action: createTicketAction,
    initial,
    url: "/api/portal/tickets",
    prepare: renameAttachments,
    loginPath: "/portal/login",
    onSuccess: useCallback((body: unknown) => {
      const reference = (body as { data?: { reference?: string } })?.data?.reference;
      router.push(reference ? `/portal/tickets/${reference}?created=1` : "/portal/tickets");
      router.refresh();
    }, [router]),
    onRefusal: useCallback((status: number) => (
      status === 429
        ? { error: "You have raised several tickets in quick succession. Wait a minute and try again." }
        : undefined
    ), []),
  });
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} onSubmitCapture={onSubmitCapture} noValidate>
      {/*
        Attachments are the one thing `Form` cannot put back — a browser will
        not let script set `input[type=file]`. Said here, because a screenshot
        silently missing from a refused ticket is found by the engineer asking
        for it.
      */}
      {state.error && (
        <Alert tone="err" title="Could not submit the ticket">
          {state.error} What you wrote is still here — any files need choosing
          again, which is a rule browsers impose on every site.
        </Alert>
      )}

      <Field label="Subject" htmlFor="subject" error={err("subject")}
        hint="A short summary — you can add the detail below.">
        <Input id="subject" name="subject" required maxLength={180}
          defaultValue={defaultSubject}
          aria-invalid={Boolean(err("subject"))} />
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="ticket_category_id" error={err("ticket_category_id")} variant="float-static">
          <Select id="ticket_category_id" name="ticket_category_id" defaultValue=""
            aria-invalid={Boolean(err("ticket_category_id"))}>
            <option value="">Not sure / other</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Priority" htmlFor="priority" error={err("priority")} variant="float-static">
          <Select id="priority" name="priority" defaultValue="normal"
            aria-invalid={Boolean(err("priority"))}>
            {priorities.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="What is happening?" htmlFor="description" error={err("description")}
        hint="What changed, when it started, who is affected, and the site or device name if you know it.">
        <Textarea id="description" name="description" rows={7} required
          aria-invalid={Boolean(err("description"))} />
      </Field>

      <Field label="Attachments" htmlFor="attachments" error={err("attachments")}
        hint="Screenshots, photos, logs or a PDF. Up to 5 files, 10 MB each." variant="above">
        <FileDrop
          id="attachments"
          name="attachments"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv"
          label="Select files…"
          progress={progress}
        />
      </Field>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending}>
          {pending ? "Submitting…" : "Submit ticket"}
        </Button>
        <p className="text-13 text-muted">
          You will get a reference immediately and a first response within your SLA.
        </p>
      </div>
    </Form>
  );
}

/**
 * What the action does to the form before posting it, done here for the
 * watched path: drop the empty entry an untouched file input still submits,
 * and post the rest under the name the API expects.
 */
function renameAttachments(data: FormData) {
  const files = data.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  data.delete("attachments");
  files.forEach((f) => data.append("attachments[]", f));
}
