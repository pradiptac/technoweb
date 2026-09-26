"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { AddressFields } from "@/components/forms/address-fields";
import { PageContextFields } from "@/components/forms/page-context-fields";
import { PreferredTimesField } from "@/components/visits/preferred-times-field";
import { requestVisitAction, type VisitRequestState } from "./actions";
import type { VisitOptions } from "@/types/api";

const initial: VisitRequestState = {};

/**
 * The engineer visit request (docs/visits.md): what it is about, where the
 * site is, who to ring, and up to three times that would suit.
 *
 * The page is dynamic only for `?service=` and friends; who is signed in is
 * asked after mount from `/api/visits/me`, never read from a cookie while
 * rendering, and fills only fields still empty — the store's back-in-stock
 * form does the same. Everything prefilled stays editable.
 */
export function VisitRequestForm({
  options,
  preset,
  messagingChannels,
}: {
  options: VisitOptions;
  preset: { serviceId?: number; solutionId?: number; locationId?: number };
  messagingChannels: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(requestVisitAction, initial);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];
  // A wrapper, not a ref on `<Form>`: that component keeps its own ref for
  // restoring a refused submission, and a spread one would replace it.
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/visits/me", { cache: "no-store" })
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((body: { data?: Record<string, string | null> } | null) => {
        const form = wrapRef.current?.querySelector("form");
        if (cancelled || !form || !body?.data) return;
        for (const [name, value] of Object.entries(body.data)) {
          const input = form.elements.namedItem(name);
          if (input instanceof HTMLInputElement && !input.value && value) input.value = value;
        }
      })
      .catch(() => { /* A convenience; the form works empty. */ });

    return () => { cancelled = true; };
  }, []);

  if (state.ok) {
    return (
      <Alert tone="ok" title={`Request ${state.reference} sent`} dismissible={false}>
        We have it. This is a request rather than a booking: we will confirm the actual time by email
        to {state.email}, usually within one working day.{" "}
        <Link href={`/visit/${state.reference}`} className="font-semibold underline">View or change your request</Link>.
      </Alert>
    );
  }

  return (
    <div ref={wrapRef} className="min-w-0">
    <Form action={formAction} state={state} noValidate>
      <PageContextFields />

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && <Alert tone="err" title="Could not send">{state.error}</Alert>}

      <h2 className="mb-3 text-17 font-semibold">What is it about?</h2>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Service" htmlFor="service_id" variant="float-static" error={err("service_id")}
          hint="Leave it as a site survey if you are not sure.">
          <Select id="service_id" name="service_id" defaultValue={preset.serviceId ?? ""}>
            <option value="">Site survey — not sure yet</option>
            {options.services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </Field>

        {options.locations.length > 0 && (
          <Field label="Nearest city" htmlFor="location_id" variant="float-static" error={err("location_id")}>
            <Select id="location_id" name="location_id" defaultValue={preset.locationId ?? ""}>
              <option value="">Somewhere else</option>
              {options.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {preset.solutionId && <input type="hidden" name="solution_id" value={preset.solutionId} />}

      <h2 className="mt-4 mb-3 text-17 font-semibold">Where is the site?</h2>
      <AddressFields prefix="site_" errorPrefix="site_address" autoCompletePrefix="" err={err} />

      <Field label="Anything the engineer should know? (optional)" htmlFor="notes" error={err("notes")}
        hint="How many floors or rooms, what is there now, access or parking — whatever saves a second trip.">
        <Textarea id="notes" name="notes" rows={4} maxLength={2000} />
      </Field>

      <PreferredTimesField rules={options} err={err} />

      <h2 className="mt-4 mb-3 text-17 font-semibold">Who should we call?</h2>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" required autoComplete="name" aria-invalid={Boolean(err("name"))} />
        </Field>
        <Field label="Company (optional)" htmlFor="company" error={err("company")}>
          <Input id="company" name="company" autoComplete="organization" />
        </Field>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Mobile" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required aria-invalid={Boolean(err("phone"))} />
        </Field>
        <Field label="Email" htmlFor="email" error={err("email")} hint="The confirmation goes here.">
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(err("email"))} />
        </Field>
      </div>

      {/*
        Updates on the mobile above, one box per phone channel that can
        deliver now — the checkout's boxes, unticked, because consent is
        something a person gives.
      */}
      {messagingChannels.length > 0 && (
        <fieldset className="mb-4 grid gap-1.5">
          <legend className="sr-only">Visit updates on your mobile</legend>
          {messagingChannels.map((c) => (
            <label key={c.value} className="flex min-h-6 items-start gap-2.5 text-14">
              <input type="checkbox" name="message_opt_in" value={c.value}
                className="mt-1 size-4 shrink-0 accent-[var(--color-brand-600)]" />
              <span>Send visit updates to this number on {c.label}. Reply STOP to end them.</span>
            </label>
          ))}
        </fieldset>
      )}

      <Button type="submit" pending={pending}>{pending ? "Sending…" : "Request a visit"}</Button>
    </Form>
    </div>
  );
}
