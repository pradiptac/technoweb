"use client";

import { useActionState } from "react";
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
  const [state, formAction, pending] = useActionState(createTicketAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} noValidate>
      {state.error && <Alert tone="err" title="Could not submit the ticket">{state.error}</Alert>}

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
        />
      </Field>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit ticket"}
        </Button>
        <p className="text-[13px] text-muted">
          You will get a reference immediately and a first response within your SLA.
        </p>
      </div>
    </form>
  );
}
