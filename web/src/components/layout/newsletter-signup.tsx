"use client";

import { useActionState } from "react";
import { subscribeAction } from "@/app/(marketing)/newsletter/actions";

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
 */
export function NewsletterSignup({ onDark = false }: { onDark?: boolean }) {
  const [state, action, pending] = useActionState(subscribeAction, {});

  if (state.ok) {
    return (
      <p
        role="status"
        className={onDark ? "text-[14px] text-dark-ink" : "text-[14px] text-ink"}
      >
        {state.ok}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-2">
      <label htmlFor="newsletter-email" className={onDark ? "text-[13px] text-dark-muted" : "text-[13px] text-muted"}>
        Occasional notes on infrastructure, and what we have been building.
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className={
            onDark
              ? "min-w-0 flex-1 rounded border border-dark-line bg-dark-2 px-3 py-2.5 text-[15px] text-white placeholder:text-dark-muted"
              : "min-w-0 flex-1 rounded border border-line-strong bg-card px-3 py-2.5 text-[15px]"
          }
        />

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
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

      {state.error && (
        <p role="alert" className="text-[13px] text-err">{state.error}</p>
      )}

      <p className={onDark ? "text-[12px] text-dark-muted" : "text-[12px] text-faint"}>
        One click to unsubscribe, in every message. We never pass your address on.
      </p>
    </form>
  );
}
