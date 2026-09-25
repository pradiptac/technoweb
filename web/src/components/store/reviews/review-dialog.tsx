"use client";

import { useActionState, useEffect, useId, useState, type KeyboardEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Form } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { StarGlyph } from "@/components/store/stars";
import { submitReviewAction, type ReviewFormState } from "@/components/store/review-actions";
import type { MyReviewState } from "@/types/api";

const initial: ReviewFormState = {};
const BODY_MAX = 2000;
const TITLE_MAX = 120;
const WORDS = ["Dislike it!", "Not great", "It's fine", "Like it", "Love it!"];

/**
 * Write (or rewrite) a review — the stepped dialog from the client's
 * reference: "How would you rate this item?", then the words, then thanks.
 *
 * `Modal` is the real `<dialog>`: focus is trapped, Escape closes it, the
 * page behind is inert. **Both steps live in one `<Form>`** and the first is
 * hidden rather than unmounted when the second shows, so the rating radio is
 * still in the submission — the rule every tabbed form here follows.
 *
 * Signed out is step zero: "Sign in to write a review", linking to the
 * portal login with a `return` path back to this product with `?review=1`,
 * which opens this dialog again. Who is signed in is asked of
 * `/api/store/reviews/mine` by the parent after the page has loaded, never
 * during its render — the product page is cached whole.
 */
export function ReviewDialog({
  open, onClose, slug, productName, mine, onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  productName: string;
  /** Undefined while being asked; the answer otherwise. */
  mine: MyReviewState | undefined;
  onSubmitted: () => void;
}) {
  const existing = mine && mine.signedIn ? mine.data : null;
  const [state, formAction, pending] = useActionState(submitReviewAction, initial);
  const [rating, setRating] = useState<number>(0);
  const [step, setStep] = useState<"rate" | "write">("rate");
  const [body, setBody] = useState("");
  const groupId = useId();

  const chosen = rating || existing?.rating || 0;

  // The parent learns a review went in, so its "Write" button can say "Edit".
  useEffect(() => {
    if (state.ok) onSubmitted();
  }, [state.ok, onSubmitted]);

  const returnTo = `/store/products/${slug}?review=1`;
  const title = existing ? "Edit your review" : "Write a review";

  let content;

  if (mine === undefined) {
    content = <p className="py-6 text-center text-14 text-muted" role="status">One moment…</p>;
  } else if (!mine.signedIn || state.signedOut) {
    content = (
      <div className="grid justify-items-center gap-3 py-4 text-center">
        <p className="text-15 font-semibold">Sign in to write a review</p>
        <p className="max-w-[40ch] text-13-5 text-muted">
          Reviews come from customers with an account, so every one has a real person behind it. A
          review from somebody who bought it here is marked Verified.
        </p>
        <ButtonLink href={`/portal/login?return=${encodeURIComponent(returnTo)}`} className="mt-1">
          Sign in
        </ButtonLink>
      </div>
    );
  } else if (state.ok) {
    content = (
      <div className="grid justify-items-center gap-2 py-6 text-center" role="status">
        <p className="text-15 font-semibold">Thanks — we&apos;ll publish it once it has been checked.</p>
        <p className="max-w-[40ch] text-13-5 text-muted">
          Every review is read by a person first. You can change yours from this page at any time; a
          changed review is read again before it reappears.
        </p>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={onClose}>Close</Button>
      </div>
    );
  } else {
    const onStarKey = (e: KeyboardEvent<HTMLDivElement>) => {
      // Enter moves on, the way a click does; arrows only move the choice.
      if (e.key === "Enter" && chosen) {
        e.preventDefault();
        setStep("write");
      }
    };

    content = (
      <Form action={formAction} state={state} className="grid gap-4">
        <input type="hidden" name="slug" value={slug} />
        {/* The honeypot, off-screen the way every public form's is. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={`${groupId}-website`}>Website</label>
          <input id={`${groupId}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {state.error && <Alert tone="err" title="That did not go in">{state.error}</Alert>}

        <fieldset hidden={step !== "rate"} className="grid justify-items-center gap-4 py-2">
          <legend className="mb-4 w-full text-center font-display text-[20px] font-semibold leading-snug">
            How would you rate this item?
          </legend>
          {/*
            A radio group: one tab stop, arrows move the choice, and a press
            (or Enter) moves on. Each star is a 44px target.
          */}
          <div onKeyDown={onStarKey} className="flex justify-center gap-0.5 sm:gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="grid cursor-pointer place-items-center rounded-md p-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600">
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={chosen === n}
                  onChange={() => setRating(n)}
                  onClick={(e) => { if (e.detail > 0) setStep("write"); }}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className="sr-only"
                />
                <StarGlyph fill={n <= chosen ? 1 : 0} className="size-9 sm:size-10" />
              </label>
            ))}
          </div>
          <div aria-hidden="true" className="flex w-full max-w-[17rem] justify-between text-12-5 font-medium text-muted sm:max-w-[19rem]">
            <span>{WORDS[0]}</span>
            <span>{WORDS[4]}</span>
          </div>
          <p className="min-h-5 text-13 text-muted" aria-live="polite">{chosen ? WORDS[chosen - 1] : ""}</p>
          <Button type="button" size="sm" disabled={!chosen} onClick={() => setStep("write")}>Next</Button>
        </fieldset>

        <div hidden={step !== "write"} className="grid gap-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-13 text-muted">Your rating</span>
            <span role="img" aria-label={`${chosen} out of 5`} className="inline-flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => <StarGlyph key={n} fill={n <= chosen ? 1 : 0} className="size-4" />)}
            </span>
            <button type="button" onClick={() => setStep("rate")} className="inline-flex min-h-6 items-center text-13 font-semibold text-brand-ink hover:underline">
              Change
            </button>
          </div>

          {mine.signedIn && mine.meta.verified && (
            <p className="mb-2 text-12-5 text-muted">You bought this here, so your review will be marked Verified.</p>
          )}

          <Field label="Title (optional)" htmlFor={`${groupId}-title`} error={state.fieldErrors?.title?.[0]}>
            <Input id={`${groupId}-title`} name="title" maxLength={TITLE_MAX} defaultValue={existing?.title ?? ""} />
          </Field>

          <Field
            label="Your review"
            htmlFor={`${groupId}-body`}
            error={state.fieldErrors?.body?.[0]}
            hint={`${(body || existing?.body || "").length} of ${BODY_MAX} characters`}
          >
            <Textarea
              id={`${groupId}-body`}
              name="body"
              rows={5}
              maxLength={BODY_MAX}
              required={step === "write"}
              defaultValue={existing?.body ?? ""}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          <p className="mb-3 text-12-5 text-muted">
            Plain words only. Every review is read before it appears, and an edited one is read again.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" pending={pending}>
              {pending ? "Sending…" : existing ? "Update review" : "Submit review"}
            </Button>
          </div>
        </div>
      </Form>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} description={productName}>
      {content}
      {existing && existing.status !== "published" && !state.ok && mine?.signedIn && (
        <p className="mt-3 text-12-5 text-muted">
          Your review is {existing.status === "pending" ? "waiting to be checked" : "not published"}; saving it again sends it back to be read.
        </p>
      )}
    </Modal>
  );
}
