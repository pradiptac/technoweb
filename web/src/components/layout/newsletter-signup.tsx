"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { subscribeAction } from "@/app/(marketing)/newsletter/actions";
import { cn } from "@/lib/utils";

/**
 * The signup form, for the footer.
 *
 * **It answers the same thing whatever happens**, because the API does: a new
 * address, one already subscribed and one that has unsubscribed all come back
 * with one sentence. Anything else would make this a membership oracle — post
 * addresses, read which come back "already subscribed", and you have a list of
 * this company's customers.
 *
 * The honeypot is `website`, the name every other form on this site uses. It
 * is hidden from sight *and* from assistive technology, and `tabIndex={-1}`
 * keeps it out of the keyboard order — a field a screen reader announces is
 * one a real person fills in.
 *
 * **It stacks on a phone and sits in a row above it**, which is a decision the
 * container earns rather than one this file makes for itself. In the footer's
 * brand column it had about 270px: side by side, that left the input around
 * 150px and clipped `you@company.com` to `you@company.` before anybody had
 * typed. It lives in a band across the footer now, so there is room for the row
 * — and the stacked form below `sm` is what a phone wants anyway.
 */
export function NewsletterSignup({ onDark = false }: { onDark?: boolean }) {
  const [state, action, pending] = useActionState(subscribeAction, {});

  if (state.ok) {
    return (
      <p
        role="status"
        className={cn(
          "rounded-md border px-3 py-2.5 text-[13.5px]",
          onDark ? "border-ok/30 bg-ok/10 text-dark-ink" : "border-ok/30 bg-ok-soft text-ink",
        )}
      >
        {state.ok}
      </p>
    );
  }

  return (
    <Form action={action} state={state} className="grid gap-2">
      {/*
        Visually hidden, not absent.

        The band around this carries a heading and a sentence that say what
        somebody is signing up for, so repeating them here would be the same
        text twice. What a screen reader still needs is a label on the field
        itself — an input labelled only by a heading two elements away is one
        announced as "edit text, blank".
      */}
      <label htmlFor="newsletter-email" className="sr-only">
        Your email address, to receive occasional notes on infrastructure
      </label>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(state.error)}
          className={cn(
            // `min-w-0` so the input may shrink inside the row: a flex item's
            // automatic minimum size is its content, which is what pushes a
            // form like this past the edge of a narrow column.
            "min-w-0 flex-1 rounded-md border px-3 py-2.5 text-[15px] transition-colors",
            "focus:outline-none focus:ring-3",
            onDark
              ? "border-dark-line bg-dark-2 text-white placeholder:text-dark-muted focus:border-brand-400 focus:ring-brand-500/25"
              : "border-line-strong bg-card placeholder:text-faint focus:border-brand-400 focus:ring-brand-100",
          )}
        />

        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Signing up…" : "Sign up"}
        </button>
      </div>

      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-px w-px opacity-0"
      />

      {/*
        `role="alert"` and `err` on both schemes — the status tokens are chosen
        to read on white, so the dark footer takes the dark-scheme value rather
        than a literal that would not invert.
      */}
      {state.error && (
        <p role="alert" className="text-[13px] text-err">
          {state.error}
        </p>
      )}
    </Form>
  );
}
