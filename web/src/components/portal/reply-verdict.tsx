"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { rateReplyAction, reportReplyAction, type VerdictState } from "@/app/portal/(app)/tickets/[reference]/actions";

/**
 * The customer's verdict on one staff reply, in the footer of its bubble:
 * five stars ("Rate my response"), and "Report this reply".
 *
 * ## The stars
 *
 * Five radio buttons, not five buttons — a group with one value is what a
 * screen reader should hear, and arrow keys move between them for free.
 * The visual star is a label over an `sr-only` input; the row lights up to
 * the hovered star so the pointer can see what it is about to choose, and
 * to the chosen one otherwise. Choosing saves at once through a Server
 * Action inside a transition, so the stars never lock: an optimistic value
 * paints immediately and the server's answer replaces it. A rating may be
 * changed, the chatbot's rule — a rating that cannot be taken back is one
 * people stop giving.
 *
 * ## The report
 *
 * A button that opens a short form under the bubble rather than a modal:
 * the customer is looking at the reply they object to and should keep
 * looking at it while they say why. A `<Form>` with `state`, so a refused
 * reason comes back with the words still in the box. Re-sending re-words
 * the report; the desk sees the reason and when it was first raised.
 */
export function ReplyVerdict({
  reference, messageId, rating, reportReason, reportedAt,
}: {
  reference: string;
  messageId: number;
  rating: number | null;
  reportReason: string | null;
  reportedAt: string | null;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <Stars reference={reference} messageId={messageId} rating={rating} />
      <Report reference={reference} messageId={messageId} reason={reportReason} reportedAt={reportedAt} />
    </div>
  );
}

function Stars({ reference, messageId, rating }: { reference: string; messageId: number; rating: number | null }) {
  const name = useId();
  // The optimistic value while the action is in flight; null means "the
  // server's". Cleared when the answer lands, so a refresh or another tab's
  // change shows through without an effect syncing prop to state.
  const [override, setOverride] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const chosen = override ?? rating;
  const lit = hover ?? chosen ?? 0;

  const choose = (n: number) => {
    setOverride(n);
    setError(null);
    start(async () => {
      const res = await rateReplyAction(reference, messageId, n);
      if (res.error) setError(res.error);
      setOverride(null);
    });
  };

  return (
    <fieldset className="flex items-center gap-2" aria-busy={pending} onMouseLeave={() => setHover(null)}>
      <legend className="sr-only">Rate this reply</legend>
      <div className="flex" role="radiogroup" aria-label="Rate this reply, one to five stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer p-0.5"
            onMouseEnter={() => setHover(n)}
            title={`${n} star${n === 1 ? "" : "s"}`}
          >
            <input
              type="radio" name={name} value={n} checked={chosen === n}
              onChange={() => choose(n)}
              className="peer sr-only"
            />
            <Star filled={n <= lit} className="size-[18px] transition-colors duration-(--duration-fast) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500" />
            <span className="sr-only">{n} star{n === 1 ? "" : "s"}</span>
          </label>
        ))}
      </div>
      <span className="text-12-5 text-muted">
        {error ? <span className="text-err">{error}</span> : chosen ? "Thanks — you can change it." : "Rate my response"}
      </span>
    </fieldset>
  );
}

function Star({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(className, filled ? "text-warn" : "text-muted")}>
      <path
        d="M12 2.8l2.85 5.94 6.5.83-4.77 4.5 1.22 6.45L12 17.4l-5.8 3.12 1.22-6.45-4.77-4.5 6.5-.83L12 2.8z"
        fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
    </svg>
  );
}

const initial: VerdictState = {};

function Report({ reference, messageId, reason, reportedAt }: { reference: string; messageId: number; reason: string | null; reportedAt: string | null }) {
  const [state, formAction, pending] = useActionState(reportReplyAction, initial);
  const id = useId();
  // Opened against a particular action state: a successful send produces a
  // new `ok` state and the form closes by itself, a refused one keeps it
  // open with the error, and pressing the button again opens it afresh.
  const [openFor, setOpenFor] = useState<VerdictState | null>(null);
  const open = openFor !== null && (openFor === state || !state.ok);
  const setOpen = (next: boolean) => setOpenFor(next ? state : null);

  return (
    <div className="basis-full sm:basis-auto">
      <div className="flex items-center gap-3">
        <Button type="button" variant={reportedAt ? "secondary" : "warn"} size="sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
          {reportedAt ? "Edit your report" : "Report this reply"}
        </Button>
        {reportedAt && !open && (
          <span className="text-12-5 text-muted">Reported — the support desk has been told.</span>
        )}
      </div>
      {open && (
        <div id={id} className="mt-3 rounded-lg border border-line-strong bg-surface p-4">
          <Form action={formAction} state={state} noValidate>
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="message_id" value={messageId} />
            {state.error && <Alert tone="err" title="Not sent" dismissible={false}>{state.error}</Alert>}
            <Field
              label="What was wrong with this reply?"
              htmlFor={`${id}-reason`}
              hint="Goes to the support desk with this ticket. A sentence is enough."
              variant="above"
            >
              <Textarea id={`${id}-reason`} name="reason" rows={3} required defaultValue={reason ?? ""} maxLength={2000} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" pending={pending}>{pending ? "Sending…" : reportedAt ? "Update report" : "Send report"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </Form>
        </div>
      )}
    </div>
  );
}
