"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { createMeetingAction, type MeetingActionState } from "../actions";
import { SlotPicker } from "../slot-picker";
import type { AdminMeetingIndex } from "@/types/meetings";
import type { MeetingCustomer } from "@/app/api/admin/meetings/customers/route";

const initial: MeetingActionState = {};

/**
 * A customer from the scheduling lookup (`/api/admin/meetings/customers`),
 * which answers for the sales desk as well as support — the console's own
 * search shows customers to support alone.
 */
type Found = MeetingCustomer;

/** "Company · email", either part optional. */
const contactLine = (c: Found) => [c.company, c.email].filter(Boolean).join(" · ");

/**
 * "Schedule a meeting" on somebody's behalf.
 *
 * Who: an existing customer found through the console's own search, or
 * contact details typed in. What: the type, then a host or "any free host"
 * (the API gives it to the least-booked host who is free). When: the slot
 * picker. The two confirm ticks let a booking go outside working hours or
 * over a Google busy time — never over a meeting booked here, which the API
 * refuses whatever is ticked.
 */
export function ScheduleForm({
  meta, minDate, preset, canOpenCustomers = false,
}: {
  meta: AdminMeetingIndex["meta"];
  minDate: string;
  preset?: { type?: string; host?: number | null };
  /** Whether this account may open a customer's screen — support may, sales may not. */
  canOpenCustomers?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createMeetingAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  const types = meta.types.filter((t) => t.is_active);
  const [type, setType] = useState(preset?.type && types.some((t) => t.slug === preset.type) ? preset.type : "");
  const [host, setHost] = useState<number | null>(preset?.host ?? null);
  const [outsideHours, setOutsideHours] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // The customer search.
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<{ q: string; rows: Found[] }>({ q: "", rows: [] });
  const [customer, setCustomer] = useState<Found | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const query = term.trim();

  useEffect(() => {
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        const res = await fetch(`/api/admin/meetings/customers?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: Found[] };
        setFound({ q: query, rows: body.data ?? [] });
      } catch {
        // Typing the details in still works.
      }
    }, 200);
    return () => { clearTimeout(timer); inFlight.current?.abort(); };
  }, [query]);

  const results = query.length >= 2 && found.q === query ? found.rows : [];

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not schedule it">{state.error}</Alert>}

      <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <section className="mb-6">
            <h2 className="mb-3 text-14 font-semibold">Who</h2>

            {customer ? (
              <div className="mb-[18px] flex flex-wrap items-center gap-3 rounded border border-line-strong bg-surface-2 p-3 text-13">
                <span className="min-w-0">
                  <span className="block font-semibold">{customer.name}</span>
                  <span className="block truncate text-12-5 text-muted">{contactLine(customer)}</span>
                  {customer.status && customer.status !== "active" && (
                    <span className="block text-12-5 text-warn">Account {customer.status_label?.toLowerCase() ?? customer.status}</span>
                  )}
                </span>
                {canOpenCustomers && (
                  <Link href={`/admin/customers/${customer.id}`} className="text-12-5 text-brand-ink underline">Open the customer</Link>
                )}
                <button type="button" onClick={() => setCustomer(null)} className="ml-auto text-12-5 font-semibold text-err hover:underline">
                  Not this customer
                </button>
              </div>
            ) : (
              <div className="relative mb-[18px]">
                <Field label="Find an existing customer" htmlFor="customer_search" variant="float-static"
                  hint="Name, company or email. Or leave this and type the details below for somebody new.">
                  <Input
                    id="customer_search" type="search" autoComplete="off" value={term}
                    onChange={(e) => setTerm(e.currentTarget.value)}
                    aria-controls="customer_results"
                  />
                </Field>
                {results.length > 0 && (
                  <ul id="customer_results" className="-mt-3 mb-2 grid gap-1 rounded border border-line-strong bg-card p-1">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setCustomer(c); setTerm(""); }}
                          className="w-full rounded px-2.5 py-2 text-left text-13 hover:bg-surface-2"
                        >
                          <span className="block font-medium">{c.name}</span>
                          <span className="block truncate text-12 text-muted">{contactLine(c)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.length >= 2 && found.q === query && results.length === 0 && (
                  <p className="-mt-3 mb-2 text-12-5 text-muted">No customer matches. Type their details below.</p>
                )}
              </div>
            )}

            <input type="hidden" name="customer_id" value={customer?.id ?? ""} />

            {/* Remounted when a customer is picked, so their details arrive as the fields' starting values and stay editable. */}
            <div key={customer?.id ?? "new"} className="grid gap-x-5 sm:grid-cols-2">
              <Field label="Name" htmlFor="name" error={err("name")}>
                <Input id="name" name="name" required defaultValue={customer?.name ?? ""} autoComplete="off" />
              </Field>
              <Field label="Email" htmlFor="email" error={err("email")}>
                <Input id="email" name="email" type="email" required defaultValue={customer?.email ?? ""} autoComplete="off" />
              </Field>
              <Field label="Mobile (optional)" htmlFor="phone" error={err("phone")}>
                <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" />
              </Field>
              <Field label="Company (optional)" htmlFor="company" error={err("company")}>
                <Input id="company" name="company" defaultValue={customer?.company ?? ""} autoComplete="off" />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-14 font-semibold">What and when</h2>

            <div className="grid gap-x-5 sm:grid-cols-2">
              <Field label="Kind of meeting" htmlFor="type" variant="float-static" error={err("type")}>
                <Select id="type" name="type" value={type} onChange={(e) => setType(e.currentTarget.value)} required>
                  <option value="">Choose…</option>
                  {types.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Host" htmlFor="host_id" variant="float-static" error={err("host_id")}
                hint="Any free host goes to whoever has the fewest meetings this week.">
                <Select id="host_id" name="host_id" value={host ?? ""} onChange={(e) => setHost(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
                  <option value="">Any free host</option>
                  {meta.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </Select>
              </Field>
            </div>

            <SlotPicker
              key={`picker-${state.taken ?? 0}`}
              type={type}
              host={host}
              outsideHours={outsideHours}
              googleBusy={googleBusy}
              initialDate={state.date}
              minDate={minDate}
              error={err("start")}
            />

            <Field label="Agenda (optional, the customer and the host see it)" htmlFor="agenda" error={err("agenda")}>
              <Textarea id="agenda" name="agenda" rows={3} maxLength={2000} />
            </Field>
          </section>
        </div>

        <aside className="grid content-start gap-3">
          <fieldset className="rounded border border-warn/25 bg-warn-soft p-3 text-12-5 text-warn">
            <legend className="sr-only">Overrides</legend>
            <p className="mb-2 font-semibold">Only when you mean it</p>
            <label className="mb-2 flex gap-2.5">
              <input
                type="checkbox" name="outside_hours" value="1" checked={outsideHours}
                onChange={(e) => setOutsideHours(e.currentTarget.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
              />
              <span>Offer times outside the host&apos;s working hours</span>
            </label>
            <label className="flex gap-2.5">
              <input
                type="checkbox" name="override_google_busy" value="1" checked={googleBusy}
                onChange={(e) => setGoogleBusy(e.currentTarget.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
              />
              <span>Ignore busy time in the host&apos;s Google calendar</span>
            </label>
            <p className="mt-2">A meeting already booked here is never double-booked, whatever is ticked.</p>
          </fieldset>

          <p className="text-12-5 text-muted">
            The customer is emailed the time and, once Google has made it, the Meet link. The host is sent the
            agenda. Times are in {meta.timezone_label}.
          </p>
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>{pending ? "Scheduling…" : "Schedule the meeting"}</Button>
        <Link href="/admin/meetings" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
