"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { mergeTicketAction, type MergeState } from "./actions";
import type { Ticket } from "@/types/api";

const initial: MergeState = {};

/**
 * "Merge into…": this ticket's messages and attachments move onto another
 * of the same customer's open tickets and this one closes, pointing at it.
 *
 * `others` is the customer's other open tickets, fetched by the page; the
 * reference box is for one the picker does not list — a ticket the desk
 * knows by number. Every refusal comes back from the API as a sentence on
 * `into`: another customer's ticket, one already merged, one not open.
 * A success redirects to the target, so this form never sees it.
 */
export function MergeForm({ ticket, others }: { ticket: Ticket; others: Ticket[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(mergeTicketAction, initial);
  const err = state.fieldErrors?.into?.[0];

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Merge into…
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Merge ${ticket.reference} into another ticket`}
        description="Everything on this ticket moves onto the one you choose, and this one closes with a link to it. The customer is emailed the reference to quote from now on."
      >
        <Form action={formAction} state={state} noValidate>
          <input type="hidden" name="reference" value={ticket.reference} />

          {state.error && !err && <Alert tone="err" title="Could not merge">{state.error}</Alert>}

          <Field label="Another open ticket of theirs" htmlFor="merge-pick" variant="float-static"
            hint={others.length ? "The customer's other open tickets." : "The customer has no other open ticket — type a reference below."}>
            <Select id="merge-pick" name="pick" defaultValue="" disabled={others.length === 0}>
              <option value="">{others.length ? "Choose a ticket…" : "None"}</option>
              {others.map((t) => (
                <option key={t.id} value={t.reference}>{t.reference} — {t.subject}</option>
              ))}
            </Select>
          </Field>

          <Field label="Or a reference" htmlFor="merge-into" error={err}
            hint="Typed here, it wins over the pick above. It has to be one of this customer's open tickets.">
            <Input id="merge-into" name="into" placeholder="TW-2026-00042" className="font-mono" maxLength={32}
              aria-invalid={Boolean(err)} />
          </Field>

          <div className="mt-2 flex gap-2">
            <Button type="submit" pending={pending}>{pending ? "Merging…" : "Merge tickets"}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
