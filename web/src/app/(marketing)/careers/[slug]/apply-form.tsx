"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea, FileInput } from "@/components/ui/input";
import { applyAction, type ApplyState } from "./actions";

const initial: ApplyState = {};

export function ApplyForm({ slug, title }: { slug: string; title: string }) {
  const [state, formAction, pending] = useActionState(applyAction, initial);

  if (state.sent) {
    return (
      <Alert tone="ok" title="Your application is with us">
        Thank you. We read every application, and we will be in touch if your experience lines up
        with what {title} needs. We keep applications on file for six months and then delete them,
        CV included.
      </Alert>
    );
  }

  return (
    <form action={formAction} noValidate>
      {state.error && <Alert tone="err" title="We could not send that">{state.error}</Alert>}

      <input type="hidden" name="slug" value={slug} />

      {/* The honeypot, hidden from sight and from assistive tech, out of the
          tab order, and with autocomplete off so a browser cannot fill it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="apply-website">Website</label>
        <input id="apply-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-x-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
          <Input id="name" name="name" autoComplete="name" required />
        </Field>

        <Field label="Email address" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>

        <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone?.[0]}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        </Field>

        <Field label="Current employer" htmlFor="current_company" error={state.fieldErrors?.current_company?.[0]}>
          <Input id="current_company" name="current_company" autoComplete="organization" />
        </Field>

        <Field
          label="Years of experience"
          htmlFor="experience_years"
          error={state.fieldErrors?.experience_years?.[0]}
        >
          <Input id="experience_years" name="experience_years" type="number" min={0} max={60} />
        </Field>

        <Field label="Portfolio or LinkedIn" htmlFor="portfolio_url" error={state.fieldErrors?.portfolio_url?.[0]}>
          <Input id="portfolio_url" name="portfolio_url" type="url" placeholder="https://" />
        </Field>
      </div>

      <Field
        label="Your CV"
        htmlFor="cv"
        error={state.fieldErrors?.cv?.[0]}
        hint="PDF, Word or OpenDocument, up to 2 MB."
        variant="above"
      >
        <FileInput id="cv" name="cv" accept=".pdf,.doc,.docx,.rtf,.odt" required />
      </Field>

      <Field
        label="Anything you want us to know"
        htmlFor="cover_letter"
        error={state.fieldErrors?.cover_letter?.[0]}
        hint="A few lines is plenty. What you have built, and why this role."
        variant="above"
      >
        <Textarea id="cover_letter" name="cover_letter" rows={5} />
      </Field>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send my application"}
      </Button>

      <p className="mt-3 text-[13px] leading-[1.6] text-faint">
        Your details and CV are stored securely, read only by our hiring team, and deleted after
        six months.
      </p>
    </form>
  );
}
