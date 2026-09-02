"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { resendAction, type ResendState } from "../actions";

const initial: ResendState = {};

export function ResendButton({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(resendAction, initial);

  return (
    <Form action={formAction} state={state} className="mt-6">
      <input type="hidden" name="email" value={email} />

      {state.error && <Alert tone="err" title="Could not send it">{state.error}</Alert>}
      {state.sent && (
        <Alert tone="ok" title="On its way">
          We have sent the link again. Give it a minute, and check your spam folder.
        </Alert>
      )}

      {/*
        Still offered after a successful send. A link that has not arrived is
        the one situation this button exists for, and hiding it after the first
        press leaves somebody stuck on a page with nothing to press.
      */}
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? "Sending…" : state.sent ? "Send it again" : "Resend the confirmation link"}
      </Button>
    </Form>
  );
}
