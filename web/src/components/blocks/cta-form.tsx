"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageContextFields } from "@/components/forms/page-context-fields";
import { submitCtaAction, type CtaFormState } from "./cta-actions";

/**
 * The form a CTA banner carries — newsletter, gated download or webinar.
 *
 * One component for three layouts because they differ only in which fields
 * they ask for and what they say afterwards. `<Form>`, not a bare form, so a
 * refused submission comes back with what was typed (the React 19 reset);
 * the honeypot is `website` and the page envelope is `PageContextFields`,
 * like every public form. A download's link appears only in the success
 * state — the API hands out the file's URL there and nowhere else.
 */
export function CtaForm({ slug, kind, placeholder, buttonLabel }: {
  slug: string;
  kind: "newsletter" | "gated_download" | "webinar";
  placeholder?: string | null;
  buttonLabel?: string | null;
}) {
  const [state, action, pending] = useActionState<CtaFormState, FormData>(submitCtaAction.bind(null, slug), {});
  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const id = (f: string) => `cta-${slug}-${f}`;

  if (state.ok) {
    return (
      <div role="status" className="rounded-lg bg-card p-5 text-ink">
        <p className="text-14-5 font-semibold">{state.ok}</p>
        {state.download && (
          <a href={state.download} download className="mt-3 inline-flex min-h-11 items-center rounded-md bg-brand-600 px-4 text-14 font-semibold text-brand-on hover:bg-brand-700">
            Download the PDF
          </a>
        )}
      </div>
    );
  }

  const defaults = { newsletter: "Subscribe", gated_download: "Send me the file", webinar: "Register" } as const;

  return (
    <Form action={action} state={state} className="rounded-lg bg-card p-5 text-ink">
      <PageContextFields />
      {/* The honeypot: hidden from people and screen readers, filled by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={id("website")}>Website</label>
        <input id={id("website")} name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {kind === "webinar" && (
        <Field label="Your name" htmlFor={id("name")} error={err("name")}>
          <Input id={id("name")} name="name" autoComplete="name" required />
        </Field>
      )}
      {kind === "gated_download" && (
        <Field label="Your name (optional)" htmlFor={id("name")} error={err("name")}>
          <Input id={id("name")} name="name" autoComplete="name" />
        </Field>
      )}
      <Field label="Work email" htmlFor={id("email")} error={err("email")}>
        <Input id={id("email")} name="email" type="email" autoComplete="email" required placeholder={placeholder ?? undefined} />
      </Field>
      {kind !== "newsletter" && (
        <Field label="Company (optional)" htmlFor={id("company")} error={err("company")}>
          <Input id={id("company")} name="company" autoComplete="organization" />
        </Field>
      )}

      {state.error && <p role="alert" className="mb-3 text-13 text-err">{state.error}</p>}
      <Button type="submit" pending={pending} className="w-full">
        {buttonLabel || defaults[kind]}
      </Button>
    </Form>
  );
}
