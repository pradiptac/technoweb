"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addRegistrationAction, type RegistrationActionState } from "../../actions";

/** The fields with a control of their own to sit under; anything else is said in the summary. */
const PLACED = ["name", "email", "phone", "company", "seats", "note"];

/**
 * "Add a registration": the desk registering somebody by hand — a customer
 * who rang, a colleague's guest, a name off a paper list.
 *
 * The public form's fields, plus the two decisions only the desk may take.
 * **Go past the limit** registers them although the event is full or its
 * closing time has passed; without it the API refuses exactly as it refuses
 * the public, and its sentence is shown here. **Email them the
 * confirmation** is ticked by default, because that message is how they get
 * the calendar file and the join link; unticked, they are added silently.
 *
 * A refusal is drawn *inside* the dialog. In the console an error `Alert`
 * becomes a toast, and a toast behind an open `<dialog>` is inert and unseen
 * — so this one is `dismissible={false}`, which keeps it inline.
 */
export function AddRegistration({
  eventId, maxSeats, full, waitlist,
}: {
  eventId: number;
  /** The event's seats-per-registration limit, when the API said. */
  maxSeats: number | null;
  /** Whether every seat is taken — said before the form is filled in, not after. */
  full: boolean;
  /** Whether a full event keeps a waiting list; null when the API did not say. */
  waitlist: boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  /*
    The server action, wrapped: a success closes the dialog and says what
    became of the registration, which is the API's answer rather than a
    guess — added past a full event without "go past the limit", somebody
    lands on the waiting list.
  */
  const [state, formAction, pending] = useActionState(
    async (prev: RegistrationActionState, formData: FormData) => {
      const res = await addRegistrationAction(eventId, prev, formData);
      if (res.ok) {
        setOpen(false);
        toast(res.status === "waitlisted"
          ? { tone: "info", title: "Added to the waiting list", body: "The event is full, so they are waiting for a place." }
          : { tone: "ok", title: "Registration added" });
      }
      return res;
    },
    {},
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const loose = state.error && !PLACED.some((f) => err(f)) ? state.error : null;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>Add a registration</Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a registration"
        description="For somebody who registered another way. It files a lead like every other registration."
      >
        <Form action={formAction} state={state} noValidate>
          {loose && <Alert tone="err" title="Could not add them" dismissible={false}>{loose}</Alert>}

          {full && (
            <Alert tone="warn" title="Every seat is taken" dismissible={false}>
              {waitlist === false
                ? "Without “Go past the limit” below, this registration is refused."
                : "Without “Go past the limit” below, they join the waiting list — or are refused if the event keeps none."}
            </Alert>
          )}

          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="add-reg-name" error={err("name")}>
              <Input id="add-reg-name" name="name" maxLength={120} autoComplete="off" required aria-invalid={Boolean(err("name"))} />
            </Field>
            <Field label="Email" htmlFor="add-reg-email" error={err("email")}>
              <Input id="add-reg-email" name="email" type="email" autoComplete="off" required aria-invalid={Boolean(err("email"))} />
            </Field>
            <Field label="Phone" htmlFor="add-reg-phone" error={err("phone")}>
              <Input id="add-reg-phone" name="phone" type="tel" maxLength={30} autoComplete="off" aria-invalid={Boolean(err("phone"))} />
            </Field>
            <Field label="Company" htmlFor="add-reg-company" error={err("company")}>
              <Input id="add-reg-company" name="company" maxLength={160} autoComplete="off" aria-invalid={Boolean(err("company"))} />
            </Field>
          </div>

          <Field label="Seats" htmlFor="add-reg-seats" error={err("seats")}
            hint={maxSeats ? `The event allows ${maxSeats} per registration.` : undefined}>
            <Input id="add-reg-seats" name="seats" type="number" inputMode="numeric" min={1} step={1} defaultValue={1}
              aria-invalid={Boolean(err("seats"))} />
          </Field>

          <Field label="Note" htmlFor="add-reg-note" error={err("note")}
            hint="Anything they asked for — access, dietary needs. Plain text.">
            <Textarea id="add-reg-note" name="note" rows={2} maxLength={1000} aria-invalid={Boolean(err("note"))} />
          </Field>

          <label className="mb-3 flex items-start gap-2.5 text-13-5">
            <input type="checkbox" name="force" value="1" className="mt-0.5 size-4 shrink-0 accent-brand-600" />
            <span>
              Go past the limit
              <span className="mt-0.5 block text-12-5 text-muted">
                Register them even though the event is full or registration has closed.
              </span>
            </span>
          </label>

          <label className="mb-[18px] flex items-start gap-2.5 text-13-5">
            <input type="checkbox" name="notify" value="1" defaultChecked className="mt-0.5 size-4 shrink-0 accent-brand-600" />
            <span>
              Email them the confirmation
              <span className="mt-0.5 block text-12-5 text-muted">
                With the calendar file, and the join link when the event has one. Unticked, they are added and told nothing.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={pending}>{pending ? "Adding…" : "Add the registration"}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
