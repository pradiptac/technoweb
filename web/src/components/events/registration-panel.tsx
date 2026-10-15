"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { PageContextFields } from "@/components/forms/page-context-fields";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { GlyphExternal } from "@/components/events/glyphs";
import { registerForEventAction, type RegisterState } from "@/components/events/actions";
import type { EventAvailability, EventAvailabilityState, EventFormat, EventRegistrationRules } from "@/types/events";

const initial: RegisterState = {};

const STATES: readonly EventAvailabilityState[] = ["none", "external", "open", "waitlist", "full", "closed", "ended"];

/** What a refusal says when the API sent the state and no sentence. */
const REFUSAL: Record<"full" | "closed" | "ended", string> = {
  full: "Every place for this event has been taken.",
  closed: "Registration for this event has closed.",
  ended: "This event has already started, so registration is closed.",
};

/**
 * The registration panel on an event's page (docs/events-contract.md).
 *
 * **The page is served whole from the ISR cache, so it cannot know how many
 * places are left.** The server draws this from what the cached event says —
 * the standing rules: is there registration, here or elsewhere, when does it
 * close — and the panel asks `/api/events/{slug}/availability` once it is on
 * screen for what is true *now*. That route handler is `no-store`; the page
 * stays cached, which is the same trade the shop's basket count and the
 * review form make.
 *
 * **What the server draws is the common case, not a spinner.** An event
 * taking registrations shows its form at once, so the usual answer — `open`
 * — changes nothing on arrival and nothing moves. The rarer answers each
 * change one thing: `waitlist` rewords the heading, the line under it and
 * the button; `few_left` adds a badge; `full`, `closed` and `ended` replace
 * the form with the API's sentence. The form also works before the answer
 * arrives, and with no JavaScript at all, because the API decides again on
 * submit and a refusal comes back as words (`registerForEventAction`).
 *
 * **The line under the heading is one element that outlives every state.**
 * It is a live region, and a live region announces a *change*: mounted with
 * the page and then reworded, "Every place has been taken" is read out; a
 * paragraph that appeared already holding it would be silent. So the
 * heading, that line and the body are three slots in one shell, and only
 * their contents differ.
 *
 * `rules` is the cached event's; the availability answer wins wherever the
 * two disagree, being the newer of the two. **No count is ever shown** — the
 * API publishes none.
 *
 * The form is `<Form action state>`, so a refused submission keeps what was
 * typed (`components/ui/form.tsx`). Every id is prefixed: the closing band
 * under the page may carry a form of its own.
 */
export function RegistrationPanel({
  slug, isPast, format, rules,
}: {
  slug: string;
  /** From the cached event. A page cached before the event ended learns it from the availability answer instead. */
  isPast: boolean;
  format: EventFormat;
  rules: EventRegistrationRules;
}) {
  const [state, formAction, pending] = useActionState(registerForEventAction, initial);
  const [availability, setAvailability] = useState<EventAvailability | null>(null);
  // A wrapper, not a ref on `<Form>`: that component keeps its own ref for
  // restoring a refused submission, and a spread one would replace it.
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // An event the cached page already knows is over has nothing to ask about.
    if (isPast) return;

    let cancelled = false;

    fetch(`/api/events/${encodeURIComponent(slug)}/availability`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<{ data?: Partial<EventAvailability> }>) : null))
      .then((body) => {
        const found = body?.data;
        if (cancelled || !found?.state || !STATES.includes(found.state)) return;
        setAvailability({ state: found.state, few_left: found.few_left === true, message: found.message ?? null });
      })
      .catch(() => { /* The form still works: the API decides again on submit. */ });

    return () => { cancelled = true; };
  }, [slug, isPast]);

  /*
    Who is signed in, asked after mount and never while rendering — the page
    is cached for everybody. A signed-in customer gets their contact details
    filled in where a field is still empty; everybody else gets a 204 and an
    empty form. Written to the DOM rather than to state: the inputs are
    uncontrolled, so nothing re-renders and nothing somebody has already
    typed is touched.
  */
  useEffect(() => {
    if (isPast || rules.mode !== "open") return;

    let cancelled = false;

    fetch("/api/events/me", { cache: "no-store", headers: { Accept: "application/json" } })
      .then((res) => (res.status === 200 ? (res.json() as Promise<{ data?: Record<string, string | null> }>) : null))
      .then((body) => {
        const form = shell.current?.querySelector("form");
        if (cancelled || !form || !body?.data) return;
        for (const [name, value] of Object.entries(body.data)) {
          const input = form.elements.namedItem(name);
          if (input instanceof HTMLInputElement && input.type !== "hidden" && !input.value && value) input.value = value;
        }
      })
      .catch(() => { /* A convenience; the form works empty. */ });

    return () => { cancelled = true; };
  }, [isPast, rules.mode]);

  const current: EventAvailabilityState = availability?.state ?? (isPast ? "ended" : rules.mode);
  const external = rules.external_url && /^https?:\/\//i.test(rules.external_url) ? rules.external_url : null;
  const waitlist = current === "waitlist";
  const seats = Math.min(Math.max(Math.trunc(rules.max_seats) || 1, 1), 20);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  if (state.ok) {
    return (
      <div className="grid gap-4">
        <Alert tone="ok" title={state.status === "waitlisted" ? "You are on the waiting list" : "You are registered"} dismissible={false}>
          {state.message ?? "We have emailed your confirmation."}
        </Alert>
        {/*
          No link to the registration from here, by design: the address that
          views or cancels one carries its token, and that goes to the inbox
          and nowhere else. The page says where to find it instead.
        */}
        <p className="text-13-5 leading-[1.6] text-muted">
          That email has a link to view or cancel your registration. If it has not arrived in a few
          minutes, check the spam folder.
        </p>
        {state.status !== "waitlisted" && <div><AddToCalendar slug={slug} /></div>}
      </div>
    );
  }

  let heading = "Register";
  let status: string;
  let body: ReactNode;

  if (current === "full" || current === "closed" || current === "ended") {
    heading = "Registration";
    status = isPast && !availability ? "This event has taken place." : availability?.message ?? REFUSAL[current];
    body = current === "ended" ? null : <AddToCalendar slug={slug} />;
  } else if (current === "none") {
    heading = "No registration needed";
    status = "There is nothing to sign up for — put the date in your calendar and come along.";
    body = <AddToCalendar slug={slug} />;
  } else if (current === "external") {
    heading = "Registration";
    status = external
      ? "Places for this event are booked on the organiser's own site."
      : "Places for this event are booked on the organiser's own site. Reload this page for the link.";
    body = (
      <div className="grid gap-4">
        {external && (
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-transparent bg-brand-600 px-[22px] py-[13px] text-15 font-semibold text-brand-on shadow-2 transition-all duration-(--duration-base) ease-brand hover:bg-brand-700"
          >
            Register on their site
            <GlyphExternal className="size-4 shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <AddToCalendar slug={slug} />
      </div>
    );
  } else {
    heading = waitlist ? "Join the waiting list" : "Register";
    status = waitlist
      ? "Every place has been taken. Leave your details and we will email you if one opens."
      : rules.closes_label
        ? `Registration closes ${rules.closes_label}.`
        : "Leave your details and we will email your confirmation.";
    body = (
      <>
        <Form action={formAction} state={state} noValidate>
          <PageContextFields />
          <input type="hidden" name="slug" value={slug} />

          {/* The honeypot: out of sight, out of the tab order, and not something a browser will autofill. */}
          <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="event-reg-website">Leave this empty</label>
            <input id="event-reg-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {state.error && <Alert tone="err" title="We could not register you">{state.error}</Alert>}

          <Field label="Your name" htmlFor="event-reg-name" error={err("name")}>
            <Input id="event-reg-name" name="name" autoComplete="name" required maxLength={120} aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Email address" htmlFor="event-reg-email" error={err("email")}>
            <Input id="event-reg-email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(err("email"))} />
          </Field>

          {/* Phone beside the seats from 400px; under 400 the pair would leave the phone field 120px wide. */}
          <div className={seats > 1 ? "grid gap-x-3 min-[400px]:grid-cols-[minmax(0,1fr)_6.5rem]" : undefined}>
            <Field label="Phone (optional)" htmlFor="event-reg-phone" error={err("phone")}>
              <Input id="event-reg-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} aria-invalid={Boolean(err("phone"))} />
            </Field>

            {seats > 1 ? (
              <Field label="Seats" htmlFor="event-reg-seats" variant="float-static" error={err("seats")}>
                <Select id="event-reg-seats" name="seats" defaultValue="1" aria-invalid={Boolean(err("seats"))}>
                  {Array.from({ length: seats }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="seats" value="1" />
            )}
          </div>

          <Field label="Company (optional)" htmlFor="event-reg-company" error={err("company")}>
            <Input id="event-reg-company" name="company" autoComplete="organization" maxLength={160} />
          </Field>

          <Field
            label="Note (optional)"
            htmlFor="event-reg-note"
            error={err("note")}
            hint="Access needs, or a question you would like covered."
          >
            <Textarea id="event-reg-note" name="note" rows={2} maxLength={1000} />
          </Field>

          <Button type="submit" pending={pending} className="w-full">
            {pending ? "Sending…" : waitlist ? "Join the waiting list" : "Register"}
          </Button>

          <p className="mt-3 text-13 leading-[1.6] text-muted">
            {format !== "in_person" && !waitlist
              ? "The joining link is in your confirmation email. We use these details only to manage your place."
              : "We use these details only to manage your place and to send your confirmation."}
          </p>
        </Form>

        <div className="mt-4 border-t border-line pt-4">
          <AddToCalendar slug={slug} />
        </div>
      </>
    );
  }

  return (
    <div ref={shell} className="relative min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="text-17">{heading}</h2>
        {current === "open" && availability?.few_left && <Badge tone="progress">Few places left</Badge>}
      </div>
      <p role="status" className="mt-1.5 text-13-5 leading-[1.55] text-muted">{status}</p>
      {body && <div className="mt-5">{body}</div>}
    </div>
  );
}
