"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { resolveErrorAction, type ResolveState } from "./actions";

const initial: ResolveState = {};

/**
 * One row's "dealt with" control.
 *
 * `<Form>` rather than a bare `<form>`, like every other action in the product:
 * React resets a form after a function action completes, refused or not, and
 * `Form` is what puts the submitted values back on a refusal. Nothing is typed
 * here, but the rule is the rule — and the failure it prevents is silent.
 */
export function ResolveButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState(resolveErrorAction, initial);

  return (
    <Form action={action} state={state}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong bg-card px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors hover:border-faint disabled:opacity-60"
      >
        {pending ? "Saving…" : "Dealt with"}
      </button>
      {state.error && <p className="mt-1 text-[12px] text-err">{state.error}</p>}
    </Form>
  );
}
