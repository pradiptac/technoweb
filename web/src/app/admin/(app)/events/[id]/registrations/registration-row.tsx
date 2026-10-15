"use client";

import { useActionState, useState, useTransition, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { AdminEventRegistration, EventOption } from "@/lib/admin";
import {
  deleteRegistrationAction, moveRegistrationAction, saveRegistrationAction, type RegistrationActionState,
} from "../../actions";
import { registrationStatusTone } from "../../event-tones";

/** The two outcomes that only exist once people have been in the room. */
const AFTER_START = new Set(["attended", "no_show"]);

/*
  27px tall with 4px between them: clear of the audit's 24px target floor.
  `relative`, so the sr-only span is positioned inside its own control and
  never against the table's scroll box.
*/
const LINK = "relative rounded px-1.5 py-1 text-12-5 font-semibold hover:underline";

/**
 * A registration's status, worked from its row.
 *
 * Controlled, so a refused move puts the select back and the API's own
 * sentence sits under it — "Attended" before the event has started, a move
 * the status cannot make, a confirmation with no room for it. Cancelling
 * emails the registrant and promotes the waiting list; the API does both,
 * and the list is refreshed so whoever moved up is shown as confirmed.
 *
 * **The options are the API's.** `allowed_next` when the registration
 * carries it; otherwise every status, with the API refusing the moves it
 * will not make — its transition table is not retyped here.
 *
 * `started` is the API's answer to "has this event started", never a clock
 * on this side: false disables Attended and No-show and says why in their
 * labels; null (the API did not say) leaves them offered.
 *
 * A confirmation refused for want of room offers **Confirm anyway**: the
 * desk may overbook, but only by saying so, which is a second press rather
 * than a default.
 */
export function RegistrationStatusCell({
  eventId, registration, statuses, started,
}: {
  eventId: number;
  registration: AdminEventRegistration;
  statuses: EventOption[];
  started: boolean | null;
}) {
  const [status, setStatus] = useState(registration.status);
  const [error, setError] = useState<string | null>(null);
  /** Set when the move just refused was a confirmation — the one the desk may push through. */
  const [refusedConfirm, setRefusedConfirm] = useState(false);
  const [pending, start] = useTransition();

  const options = registration.allowed_next?.length ? registration.allowed_next : statuses;
  const label = options.find((s) => s.value === status)?.label ?? registration.status_label;

  function move(next: string, force: boolean) {
    const previous = status;
    setStatus(next);
    setError(null);
    setRefusedConfirm(false);
    start(async () => {
      const res = await moveRegistrationAction(eventId, registration.id, force ? { status: next, force: true } : { status: next });
      if (res.error) {
        setStatus(previous);
        setError(res.error);
        setRefusedConfirm(next === "confirmed" && !force);
      }
    });
  }

  function onStatus(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;

    if (next === "cancelled" && !window.confirm(`Cancel ${registration.name}'s registration? They are emailed, and the next person waiting takes the place.`)) {
      return;
    }

    move(next, false);
  }

  return (
    <td data-label="Status" className="px-3 py-2">
      <span className="flex flex-wrap items-center gap-1.5">
        {options.length > 1 ? (
          <Select
            aria-label={`Status of ${registration.name}'s registration`}
            value={status}
            disabled={pending}
            onChange={onStatus}
            className="w-[168px] py-1 text-12 max-xl:w-full"
          >
            {/* A status this console was not told about is still the row's status. */}
            {!options.some((s) => s.value === status) && <option value={status}>{label}</option>}
            {options.map((s) => {
              const early = started === false && AFTER_START.has(s.value) && s.value !== status;
              return (
                <option key={s.value} value={s.value} disabled={early}>
                  {early ? `${s.label} — once it has started` : s.label}
                </option>
              );
            })}
          </Select>
        ) : (
          <Badge tone={registrationStatusTone(status)}>{label}</Badge>
        )}

        {/* A failure stays in the row: it changed nothing, so the select is still here to try again. */}
        {error && <span role="alert" className="basis-full text-11-5 text-err">{error}</span>}
        {refusedConfirm && (
          <button type="button" disabled={pending} onClick={() => move("confirmed", true)} className={cn(LINK, "-ml-1.5 text-brand-ink")}>
            Confirm anyway<span className="sr-only"> — go past the capacity for {registration.name}</span>
          </button>
        )}
      </span>
    </td>
  );
}

/**
 * Edit and Delete for one registration.
 *
 * **Edit** is the two things the desk may change besides the status: how many
 * seats, and a note of its own that the registrant never sees. A refusal is
 * drawn inside the dialog — a toast behind a `<dialog>` is inert and unseen —
 * and a success closes it and says so.
 *
 * **Delete** is a one-press form: the row is gone by the time anything could
 * render in it, so the outcome travels in the URL and the toast reads it. It
 * removes the record without telling anybody, which is what separates it from
 * cancelling; the confirmation says so.
 */
export function RegistrationRowActions({
  eventId, registration, maxSeats, query,
}: {
  eventId: number;
  registration: AdminEventRegistration;
  /** The event's seats-per-registration limit, when known. */
  maxSeats: number | null;
  /** The list's filters and page, carried back after a delete. */
  query: { status?: string; q?: string; page?: string; per_page?: string };
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  /*
    The server action, wrapped: a success has to close the dialog, and that is
    a state change — made here, in the action's own continuation, rather than
    from an effect watching the returned state.
  */
  const [state, formAction, pending] = useActionState(
    async (prev: RegistrationActionState, formData: FormData) => {
      const res = await saveRegistrationAction(eventId, registration.id, prev, formData);
      if (res.ok) {
        setOpen(false);
        toast({ tone: "ok", title: "Registration saved" });
      }
      return res;
    },
    {},
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const loose = state.error && !err("seats") && !err("staff_note") ? state.error : null;

  return (
    <td data-label="Manage" className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-1 xl:justify-end">
        <button type="button" className={cn(LINK, "text-brand-ink")} onClick={() => setOpen(true)}>
          Edit<span className="sr-only"> {registration.name}&rsquo;s registration</span>
        </button>

        <Form action={deleteRegistrationAction}>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="registration_id" value={registration.id} />
          {query.status && <input type="hidden" name="status" value={query.status} />}
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.page && <input type="hidden" name="page" value={query.page} />}
          {query.per_page && <input type="hidden" name="per_page" value={query.per_page} />}
          <button
            type="submit"
            className={cn(LINK, "text-err")}
            onClick={(e) => {
              const ask = `Delete ${registration.name}'s registration for good? Nobody is emailed. To tell them, cancel it instead.`;
              if (!window.confirm(ask)) e.preventDefault();
            }}
          >
            Delete<span className="sr-only"> {registration.name}&rsquo;s registration</span>
          </button>
        </Form>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${registration.name}'s registration`}
        description={`${registration.email}${registration.company ? ` · ${registration.company}` : ""}`}
      >
        <Form action={formAction} state={state} noValidate>
          {loose && <Alert tone="err" title="Could not save" dismissible={false}>{loose}</Alert>}

          {registration.note && (
            <div className="mb-[18px]">
              <p className="mb-1 text-12 font-semibold uppercase tracking-[.04em] text-muted">What they wrote</p>
              {/* A stranger's words: text, never markup. */}
              <p className="whitespace-pre-wrap text-13-5 [overflow-wrap:anywhere]">{registration.note}</p>
            </div>
          )}

          <Field label="Seats" htmlFor={`reg-seats-${registration.id}`} error={err("seats")}
            hint={maxSeats ? `The event's own form allows ${maxSeats} per registration; the desk may set more.` : undefined}>
            <Input id={`reg-seats-${registration.id}`} name="seats" type="number" inputMode="numeric" min={1} step={1}
              defaultValue={registration.seats} aria-invalid={Boolean(err("seats"))} />
          </Field>

          <label className="mb-[18px] flex items-start gap-2.5 text-13-5">
            <input type="checkbox" name="force" value="1" className="mt-0.5 size-4 shrink-0 accent-brand-600" />
            <span>
              Go past the limit
              <span className="mt-0.5 block text-12-5 text-muted">
                Give them these seats even if the event has no room left for them.
              </span>
            </span>
          </label>

          <Field label="The desk's note" htmlFor={`reg-note-${registration.id}`} error={err("staff_note")}
            hint="For colleagues only. It is never shown or sent to the registrant.">
            <Textarea id={`reg-note-${registration.id}`} name="staff_note" rows={3} maxLength={5000}
              defaultValue={registration.staff_note ?? ""} aria-invalid={Boolean(err("staff_note"))} />
          </Field>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="submit" pending={pending}>{pending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          </div>
        </Form>
      </Modal>
    </td>
  );
}
