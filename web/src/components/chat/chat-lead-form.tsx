"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { captureChatLeadAction } from "./chat-actions";

/**
 * "Have somebody call me."
 *
 * **Four fields.** §17 says not to ask for what is not needed, and the reason
 * to ask inside the conversation rather than sending somebody to `/contact` is
 * that it is short — a chat window that grows a city field and a preferred
 * contact method is a form people abandon, and they were already on a page
 * with a proper contact form on it.
 *
 * It is offered rather than imposed: §40, do not interrupt every conversation
 * with a lead form. It appears when the assistant has read buying intent, and
 * it appears **collapsed** — a button, not a form — so a conversation that is
 * going somewhere else is not blocked by six inches of inputs.
 */
export function ChatLeadForm({ requirement }: { requirement?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="mt-2 rounded-lg border border-ok/25 bg-ok-soft px-3 py-2 text-[12.5px] text-ok">
        Thank you — somebody will be in touch. If it is urgent, the number in the header reaches
        the desk directly.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-md bg-brand-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Ask us to call you
      </button>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await captureChatLeadAction({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      requirement: String(form.get("requirement") ?? ""),
      company: String(form.get("company") ?? ""),
    });

    setBusy(false);

    if (result.ok) {
      setDone(true);
      return;
    }

    setError(result.error ?? "That did not go through.");
  }

  const field =
    "w-full rounded-md border border-line-strong bg-page px-2.5 py-2 text-[13px] text-ink " +
    "transition-all placeholder:text-faint focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-xl border border-line-strong bg-page p-3">
      <p className="text-[12.5px] text-muted">
        Four things, and somebody from the team will come back to you.
      </p>

      <label className="sr-only" htmlFor="chat-lead-name">Your name</label>
      <input id="chat-lead-name" name="name" required autoComplete="name" placeholder="Your name" className={field} />

      <label className="sr-only" htmlFor="chat-lead-email">Email</label>
      <input id="chat-lead-email" name="email" type="email" required autoComplete="email" placeholder="Work email" className={field} />

      <label className="sr-only" htmlFor="chat-lead-phone">Phone</label>
      <input id="chat-lead-phone" name="phone" type="tel" required autoComplete="tel" placeholder="Phone" className={field} />

      <label className="sr-only" htmlFor="chat-lead-requirement">What you need</label>
      <textarea
        id="chat-lead-requirement"
        name="requirement"
        required
        rows={2}
        // Seeded from what they already told the assistant, so nobody types
        // their requirement twice — and it stays editable, because the box is
        // where they correct what the conversation got slightly wrong.
        defaultValue={requirement ?? ""}
        placeholder="What do you need?"
        className={cn(field, "resize-none")}
      />

      {/* The honeypot, matching every other public form here. */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="chat-lead-website">Website</label>
        <input id="chat-lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Not now
        </button>
      </div>

      {/* Mounted empty and kept mounted, so a failure is announced. */}
      <p role="status" aria-live="polite" className="text-[12px] text-err">
        {error}
      </p>
    </form>
  );
}
