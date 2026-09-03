"use client";

import { useActionState, useEffect, useRef } from "react";
import { Form } from "@/components/ui/form";
import { Field, Input, Textarea, Alert } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { postCommentAction, type CommentState } from "@/app/(marketing)/blog/[slug]/comment-actions";

const initial: CommentState = {};

/**
 * Leave a comment.
 *
 * `<Form action={…} state={state}>`, never a bare `<form>`. React 19 resets a
 * form after a function action completes — refused or not — so a bare one
 * throws away a comment somebody spent five minutes writing the moment the
 * server refuses it. `Form` snapshots the submitted values and puts them back
 * on a refusal, which is the whole reason it exists.
 *
 * **The confirmation is honest.** Nothing is appended to the list optimistically:
 * the comment is waiting for a moderator, and a comment that appears and then
 * vanishes on reload is worse than an honest wait.
 */
export function CommentForm({ slug, parentId }: { slug: string; parentId?: number }) {
  const [state, action, pending] = useActionState(postCommentAction, initial);

  /*
   * How long the page has been open, through a ref rather than state.
   *
   * State would be a hydration mismatch — the server has no clock the browser
   * agrees with — and seeding state from an effect is what
   * `react-hooks/set-state-in-effect` refuses. The same technique
   * `PageContextFields` uses for the source URL, and for the same reason.
   */
  const opened = useRef<number>(0);
  const dwell = useRef<HTMLInputElement>(null);

  useEffect(() => {
    opened.current = Date.now();
  }, []);

  if (state.ok) {
    return (
      <Alert tone="ok" title="Thank you">
        {state.ok}
      </Alert>
    );
  }

  return (
    <Form
      action={action}
      state={state}
      className="mt-6 grid gap-4"
      onSubmit={() => {
        if (dwell.current && opened.current) {
          dwell.current.value = String(Math.round((Date.now() - opened.current) / 1000));
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <input type="hidden" name="seconds_on_page" ref={dwell} defaultValue="" />

      {state.error && (
        <Alert tone="err" title="That did not go through">{state.error}</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="author_name" error={state.fieldErrors?.author_name?.[0]}>
          <Input id="author_name" name="author_name" required maxLength={120} autoComplete="name" />
        </Field>

        <Field
          label="Email"
          htmlFor="author_email"
          hint="Not published — it is only so we can reply if we need to."
          error={state.fieldErrors?.author_email?.[0]}
        >
          <Input id="author_email" name="author_email" type="email" required maxLength={190} autoComplete="email" />
        </Field>
      </div>

      <Field label="Comment" htmlFor="body" error={state.fieldErrors?.body?.[0]}>
        <Textarea id="body" name="body" rows={5} required maxLength={5000} />
      </Field>

      {/*
        The honeypot, named `website` like every other public form here.

        `aria-hidden` and out of the tab order, so a screen reader and a
        keyboard never meet it — the trap is for something filling every field
        it can find, not for a person.
      */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="comment-website">Website</label>
        <input id="comment-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Post comment"}
        </Button>
        <p className="text-[12.5px] text-muted">
          Comments are read before they appear.
        </p>
      </div>
    </Form>
  );
}
