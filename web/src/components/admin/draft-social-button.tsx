"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { draftSocialAction, type DraftState } from "@/app/admin/(app)/social-posts/actions";

const initial: DraftState = {};

/**
 * "Draft a social post" in the `PageHeader` row of a published record (C7):
 * makes a LinkedIn draft and an X draft and lands on the review list.
 *
 * Never inside the record's `<Form>` — a form inside a form is invalid markup
 * — and only drawn by the four edit screens, for a published record. The
 * action redirects on success, so the only state to show is a refusal (the API
 * checks the record is visible and answers in a sentence).
 */
export function DraftSocialButton({ type, id }: { type: "blog_post" | "case_study" | "event" | "entry"; id: number }) {
  const [state, action, pending] = useActionState(draftSocialAction, initial);

  return (
    <Form action={action} state={state} className="flex items-center gap-2">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="rounded py-1 text-13-5 font-semibold text-brand-ink hover:underline disabled:opacity-60"
      >
        {pending ? "Drafting…" : "Draft a social post"}
      </button>
      {state.error && <span role="alert" className="text-12-5 text-err">{state.error}</span>}
    </Form>
  );
}
