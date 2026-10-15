"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { ignoreAddressAction, type IgnoreState } from "./actions";
import { ROW_ACTION } from "./row-action";

const initial: IgnoreState = {};

/**
 * One row's "Ignore" (or "Stop ignoring") control.
 *
 * `<Form>` rather than a bare `<form>`, like every other action in the
 * product: nothing is typed here, but a refused action would otherwise reset
 * the form, and the rule is the rule. It is a one-press form, so it carries a
 * state only to show a refusal — which, in the console, arrives as a toast.
 */
export function IgnoreButton({ id, ignored }: { id: number; ignored: boolean }) {
  const [state, action, pending] = useActionState(ignoreAddressAction, initial);

  return (
    <Form action={action} state={state}>
      <input type="hidden" name="id" value={id} />
      {/* What the press should leave the row as: ignored on the waiting view, restored on the other. */}
      <input type="hidden" name="ignored" value={ignored ? "0" : "1"} />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={ROW_ACTION}>
        {pending ? "Saving…" : ignored ? "Stop ignoring" : "Ignore"}
      </button>
      {state.error && <Alert tone="err" title={state.error} />}
    </Form>
  );
}
