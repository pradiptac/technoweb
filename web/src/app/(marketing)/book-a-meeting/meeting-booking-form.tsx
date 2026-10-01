"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { PageContextFields } from "@/components/forms/page-context-fields";
import { SlotPicker } from "@/components/meetings/slot-picker";
import { LocalTime } from "@/components/meetings/local-time";
import { cn } from "@/lib/utils";
import { bookMeetingAction, type MeetingBookingState } from "./actions";
import type { MeetingOptions, MeetingSlot } from "@/types/meetings";

const initial: MeetingBookingState = {};

/*
 * `?type=` preselects a meeting type, and is read here in the browser rather
 * than by the page: the page is prerendered and cached, and reading
 * `searchParams` on the server would make it render on every request. Through
 * `useSyncExternalStore` with a null server snapshot, so the prerender never
 * guesses and hydration picks it up.
 */
const noop = () => () => {};
const urlType = () => new URLSearchParams(window.location.search).get("type");
const noUrlType = () => null;

/**
 * The booking (docs/meetings.md): a kind of meeting, a day, a time, then who
 * you are. Each step appears once the one before it has an answer, and the
 * details stay on screen once reached — clearing a taken time must not throw
 * away what somebody typed.
 *
 * Who is signed in is asked after mount from `/api/visits/me` (the same four
 * contact fields the visit form fills), never from a cookie while
 * rendering, and fills only fields still empty.
 */
export function MeetingBookingForm({
  options,
  messagingChannels,
}: {
  options: MeetingOptions;
  messagingChannels: { value: string; label: string }[];
}) {
  const fromUrl = useSyncExternalStore(noop, urlType, noUrlType);
  const [picked, setPicked] = useState<string | null>(null);
  const [slot, setSlot] = useState<MeetingSlot | null>(null);
  const [reached, setReached] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const valid = (slug: string | null) => (slug && options.types.some((t) => t.slug === slug) ? slug : null);
  const type = valid(picked) ?? valid(fromUrl) ?? (options.types.length === 1 ? options.types[0].slug : null);
  const chosenType = options.types.find((t) => t.slug === type) ?? null;

  const [state, formAction, pending] = useActionState(async (prev: MeetingBookingState, formData: FormData) => {
    const result = await bookMeetingAction(prev, formData);
    // Taken while this person was typing: forget it and ask for the times again.
    if (result.fieldErrors?.start) {
      setSlot(null);
      setRefresh((n) => n + 1);
    }
    return result;
  }, initial);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  function chooseType(slug: string) {
    if (slug === type) return;
    setPicked(slug);
    setSlot(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("type", slug);
      window.history.replaceState(window.history.state, "", url);
    } catch { /* A convenience for sharing the link; the choice stands without it. */ }
  }

  if (state.ok) {
    return (
      <div className="grid gap-4">
        <Alert tone="ok" title={`Booked — ${state.reference}`} dismissible={false}>
          <span className="block">
            {state.date_label}, {state.time_label} {state.timezone}
            {state.starts_at && <LocalTime start={state.starts_at} timezone={options.timezone} />}.
          </span>
          <span className="mt-1 block">
            A confirmation with a calendar invitation is on its way to {state.email}.
          </span>
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          {state.meet_url ? (
            <a href={state.meet_url} target="_blank" rel="noopener noreferrer"
              className="btn inline-flex items-center rounded bg-brand-600 px-4 py-[11px] text-13-5 font-semibold text-brand-on shadow-2 transition-colors duration-(--duration-base) hover:bg-brand-700">
              Join on Google Meet
            </a>
          ) : (
            <p className="text-14 text-muted">The Google Meet link will arrive by email shortly.</p>
          )}
          <Link href={`/meeting/${state.reference}`} className="text-14 font-semibold text-brand-ink underline">
            View, move or cancel it
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-10">
      <section aria-labelledby="meeting-step-type" className="min-w-0">
        <h2 id="meeting-step-type" className="mb-4 text-19 font-semibold">1. What would you like to talk about?</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {options.types.map((t) => {
            const chosen = t.slug === type;
            return (
              <li key={t.slug} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => chooseType(t.slug)}
                  className={cn(
                    "grid h-full w-full min-w-0 gap-1 rounded-lg border p-4 text-left transition-colors duration-(--duration-base)",
                    chosen
                      ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600"
                      : "border-line-strong bg-card hover:border-brand-ink",
                  )}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className={cn("text-16 font-semibold", chosen ? "text-brand-ink" : "text-ink")}>{t.name}</span>
                    <span className="text-13 text-muted">{t.minutes} minutes</span>
                  </span>
                  {t.description && <span className="text-14 text-muted">{t.description}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {chosenType && (
        <section aria-labelledby="meeting-step-time" className="min-w-0">
          <h2 id="meeting-step-time" className="mb-4 text-19 font-semibold">2. When suits you?</h2>
          <SlotPicker
            key={chosenType.slug}
            type={chosenType.slug}
            rules={options}
            value={slot}
            refresh={refresh}
            onChange={(s) => {
              setSlot(s);
              if (s) setReached(true);
            }}
          />
        </section>
      )}

      {chosenType && reached && (
        <section aria-labelledby="meeting-step-details" className="min-w-0">
          <h2 id="meeting-step-details" className="mb-4 text-19 font-semibold">3. Who are we meeting?</h2>
          <Form action={formAction} state={state} noValidate>
            <PageContextFields />
            <input type="hidden" name="type" value={chosenType.slug} />
            <input type="hidden" name="start" value={slot?.start ?? ""} />

            {/* Honeypot — hidden from people, irresistible to bots. */}
            <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="website">Leave this empty</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            {state.error && <Alert tone="err" title="Not booked yet">{state.error}</Alert>}

            <DetailsFields err={err} agendaMax={options.agenda_max} />

            {messagingChannels.length > 0 && (
              <fieldset className="mb-4 grid gap-1.5">
                <legend className="sr-only">Meeting reminders on your mobile</legend>
                {messagingChannels.map((c) => (
                  <label key={c.value} className="flex min-h-6 items-start gap-2.5 text-14">
                    <input type="checkbox" name="message_opt_in" value={c.value}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-brand-600)]" />
                    <span>Send the confirmation and reminders to this number on {c.label}. Reply STOP to end them.</span>
                  </label>
                ))}
              </fieldset>
            )}

            <p className="mb-4 text-14" role="status">
              {slot ? (
                <>
                  <span className="font-semibold">{chosenType.name}</span>, {slot.time_label} {options.timezone_label}
                  <LocalTime start={slot.start} timezone={options.timezone} className="text-muted" />
                </>
              ) : (
                <span className="text-muted">No time chosen yet — choose one above.</span>
              )}
            </p>

            <Button type="submit" pending={pending} disabled={!slot}>{pending ? "Booking…" : "Book the meeting"}</Button>
          </Form>
        </section>
      )}
    </div>
  );
}

/**
 * The contact fields, with the signed-in customer's details filled in after
 * mount where the box is still empty. Its own component so the ask happens
 * when these fields exist — they appear only once a time has been chosen.
 */
function DetailsFields({ err, agendaMax }: { err: (field: string) => string | undefined; agendaMax: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/visits/me", { cache: "no-store" })
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((body: { data?: Record<string, string | null> } | null) => {
        const root = ref.current;
        if (cancelled || !root || !body?.data) return;
        for (const [name, value] of Object.entries(body.data)) {
          const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`);
          if (input && !input.value && value) input.value = value;
        }
      })
      .catch(() => { /* A convenience; the form works empty. */ });

    return () => { cancelled = true; };
  }, []);

  return (
    <div ref={ref} className="min-w-0">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" required autoComplete="name" aria-invalid={Boolean(err("name"))} />
        </Field>
        <Field label="Company (optional)" htmlFor="company" error={err("company")}>
          <Input id="company" name="company" autoComplete="organization" />
        </Field>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={err("email")} hint="The invitation and the Meet link go here.">
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(err("email"))} />
        </Field>
        <Field label="Mobile" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required aria-invalid={Boolean(err("phone"))} />
        </Field>
      </div>
      <Field label="What would you like to cover? (optional)" htmlFor="agenda" error={err("agenda")}
        hint="A line or two helps us bring the right person and the right answers.">
        <Textarea id="agenda" name="agenda" rows={4} maxLength={agendaMax} />
      </Field>
    </div>
  );
}
