"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import {
  approveAction, reactivateAction, rejectAction, resendAction, suspendAction,
  type CustomerActionState,
} from "./actions";
import type { AdminCustomer } from "@/types/api";

const initial: CustomerActionState = {};

/**
 * One `useActionState` per button rather than one for the panel.
 *
 * They are separate server actions with separate failures, and sharing a
 * single state would mean one button's error sitting under another. Success is
 * not handled here at all — the action redirects, and the page renders the
 * outcome from the URL, because these buttons unmount the moment the status
 * they change is written.
 */
function ActionButton({
  action, id, children, variant = "secondary", confirm,
}: {
  action: (prev: CustomerActionState, data: FormData) => Promise<CustomerActionState>;
  id: number;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <div>
      {state.error && <Alert tone="err" title="That did not work">{state.error}</Alert>}

      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant={variant} size="sm" disabled={pending}>
          {pending ? "Working…" : children}
        </Button>
      </form>
    </div>
  );
}

/** Reject and suspend both take an internal note, so both open a panel first. */
function NotedAction({
  action, id, label, title, hint, variant,
}: {
  action: (prev: CustomerActionState, data: FormData) => Promise<CustomerActionState>;
  id: number;
  label: string;
  title: string;
  hint: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initial);

  if (!open) {
    return (
      <Button type="button" variant={variant ?? "secondary"} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form action={formAction} className="rounded border border-line-strong bg-surface-2 p-3">
      {state.error && <Alert tone="err" title="That did not work">{state.error}</Alert>}

      <input type="hidden" name="id" value={id} />

      <p className="mb-2 text-[13px] font-semibold text-ink">{title}</p>

      <Field label="Note (staff only)" htmlFor={`note-${label}`} hint={hint} variant="above">
        <Textarea id={`note-${label}`} name="note" rows={2} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" variant={variant ?? "secondary"} size="sm" disabled={pending}>
          {pending ? "Working…" : label}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CustomerActions({ customer }: { customer: AdminCustomer }) {
  const { id, status, email_verified } = customer;

  return (
    <div className="space-y-3">
      {status === "pending" && (
        <>
          {/*
            Approving an unconfirmed address is allowed but never silent. Staff
            know their own customers and a phone call is better proof than an
            inbox — but it has to be a decision somebody takes knowingly.
          */}
          <ActionButton
            action={approveAction}
            id={id}
            variant="primary"
            confirm={email_verified
              ? undefined
              : "This address has never been confirmed. Activate the account anyway?"}
          >
            Activate this account
          </ActionButton>

          <NotedAction
            action={rejectAction}
            id={id}
            label="Reject"
            title="Turn this registration down"
            hint="Why, for your colleagues. The customer never sees this — they get a neutral email."
            variant="destructive"
          />
        </>
      )}

      {status === "active" && (
        <NotedAction
          action={suspendAction}
          id={id}
          label="Suspend"
          title="Switch this account off"
          hint="Ends every session immediately. Their tickets stay. No email is sent."
          variant="destructive"
        />
      )}

      {(status === "suspended" || status === "rejected") && (
        <ActionButton action={reactivateAction} id={id} variant="primary">
          Reactivate this account
        </ActionButton>
      )}

      {!email_verified && (
        <ActionButton action={resendAction} id={id}>
          Resend the confirmation email
        </ActionButton>
      )}
    </div>
  );
}
