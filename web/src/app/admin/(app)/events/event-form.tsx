"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { CoverField } from "@/components/admin/cover-field";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { BodyReplacedNote, RecordSectionsPanel, SECTIONS_TAB, useRecordSections } from "../pages/builder/record-sections";
import type { AdminEvent, EventMeta } from "@/lib/admin";
import type { PageBuilderOptions } from "@/types/api";
import { createEventAction, deleteEventAction, updateEventAction, type EventFormState } from "./actions";
import { AgendaField, SpeakersField } from "./programme-fields";
import { SeatMeter } from "./seat-meter";

const initial: EventFormState = {};

/**
 * Which panel owns which field, so a 422 can badge its tab and open it.
 *
 * A key matches a group by equality or as a prefix, so `agenda` covers
 * `agenda.3.title`, `speakers` covers `speakers.0.photo_path`, `faqs` covers
 * `faqs.1.answer` and `seo` covers `seo.title`. **A new input must be added
 * to its panel's list here**, or its error is charged to the first tab — and
 * the order here is the order of the seven children of `<Tabs>` below, which
 * reads them by position.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content", fields: ["title", "slug", "summary", "body", "status", "is_featured"] },
  // Sections in place of the written body (0.130.0) — the choice and the builder.
  SECTIONS_TAB,
  { id: "when", label: "When and where",
    fields: ["format", "starts_at", "ends_at", "venue_name", "venue_city", "venue_address", "map_url", "online_url"] },
  { id: "registration", label: "Registration",
    fields: ["registration_mode", "external_url", "capacity", "waitlist_enabled", "max_seats", "registration_closes_at", "notify_registrants"] },
  { id: "programme", label: "Programme", fields: ["agenda", "speakers"] },
  { id: "media", label: "Media", fields: ["cover_image_path"] },
  { id: "faqs", label: "FAQs", fields: ["faqs"] },
  // `seo`, like every other entity form, so /admin/events/4?tab=seo opens it.
  { id: "seo", label: "SEO", fields: ["seo"] },
];

const OWNED = GROUPS.flatMap((g) => g.fields);

/**
 * One event, in seven panels.
 *
 * Create and edit share the form; they differ in initial values and the
 * action. Every panel stays mounted (`Tabs` hides, never unmounts), so a
 * field on a panel nobody opened is still posted — and the form is
 * `noValidate`, because a `required` title on a hidden panel would block the
 * save with a browser message nobody can see. The API's own 422 is the check,
 * and it opens the panel it is about.
 *
 * **The two times are wall clocks.** `starts_at` arrives as `Y-m-d\TH:i` in
 * the site's zone, which is exactly what a `datetime-local` input holds, and
 * goes back as typed. Nothing here builds a `Date` from it: an editor in
 * another zone would otherwise move the event by the difference on every
 * save.
 *
 * **Fields that do not apply to the chosen format or mode are hidden, never
 * unmounted, and never cleared.** Switching an event to Online hides the
 * venue; switching it back shows what was there. A hidden field that the API
 * refuses is shown again with its message — hiding a panel must not hide the
 * reason a save failed, one level down.
 *
 * The page keys this component on the record's `updated_at`, so a successful
 * save mounts a fresh form on what was stored. That matters for the selects:
 * React resets a form when its action completes, and an uncontrolled select
 * resets to the option it was *mounted* with — its default is never moved by
 * a later prop — so without the key a saved "Published" would snap back to
 * "Draft" on screen.
 */
export function EventForm({ event, meta, builder }: {
  event?: AdminEvent;
  meta: EventMeta;
  /** `GET /admin/pages/builder` — the section builder's types and pickers, for the Sections tab. */
  builder: PageBuilderOptions;
}) {
  const editing = Boolean(event);
  const [state, formAction, pending] = useActionState(editing ? updateEventAction : createEventAction, initial);

  /*
    The two selects other fields depend on are controlled, so what is shown
    and hidden cannot disagree with what is chosen. That has a cost React
    hands every controlled select: it carries no default option, so the reset
    after an action — a refused one included — drops the DOM to its first
    option while the state still holds the choice, and `<Form>`, which only
    restores a control sitting at its default, leaves it there. So both are
    re-mounted on the form's `reset` event and redrawn from the state that
    never changed: the form builder's rule for its own selects.
    `FormDraft` restores through a `change` event, so a restored draft is
    followed too.
  */
  const [format, setFormat] = useState(event?.format ?? meta.formats[0]?.value ?? "in_person");
  const [mode, setMode] = useState(event?.registration_mode ?? "none");
  const anchor = useRef<HTMLSpanElement>(null);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const redraw = () => setEpoch((n) => n + 1);
    form.addEventListener("reset", redraw);
    return () => form.removeEventListener("reset", redraw);
  }, []);

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  /** Per-row errors arrive as e.g. faqs.0.answer; surface the first. */
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // The body area: the written body, or builder sections (0.130.0).
  const body = useRecordSections(event);

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  // A refusal about no particular field — said in the summary, since it has nowhere else to sit.
  const loose = Object.entries(state.fieldErrors ?? {})
    .filter(([key]) => !OWNED.some((f) => key === f || key.startsWith(`${f}.`)))
    .map(([, messages]) => messages[0])
    .filter(Boolean);

  const hasVenue = format !== "online";
  const hasLink = format !== "in_person";
  const takes = mode === "open";
  const counts = event?.counts;
  const modeBlurb = meta.registration_modes.find((m) => m.value === mode)?.blurb;
  const zone = meta.timezone;

  /** Shown when it applies, or when the API has just refused what is in it. */
  const shown = (applies: boolean, ...fields: string[]) => applies || fields.some((f) => Boolean(err(f)));

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      <span ref={anchor} hidden />
      {editing && <input type="hidden" name="id" value={event!.id} />}
      {/* Where a refused delete returns to: this event. */}
      {editing && <input type="hidden" name="back" value={`/admin/events/${event!.id}`} />}

      {state.error && (
        <Alert tone="err" title="Could not save">
          {loose.length > 0 ? loose.join(" ") : state.error}
        </Alert>
      )}

      {/* Seven children, one per entry in GROUPS and in that order. */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        {/* ---------------------------------------------------------- Content */}
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={event?.title} maxLength={160} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "The page's address: /events/…. Changing it leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={event?.slug} className="font-mono text-14"
                autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="A sentence or two. Shown on the Events page and under the heading, and used as the meta description when no SEO override is set. Max 300 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={event?.summary ?? ""}
                maxLength={300} aria-invalid={Boolean(err("summary"))} />
            </Field>

            <BodyReplacedNote state={body} />

            <EditorField name="body" label="About the event" defaultValue={event?.body ?? ""} error={err("body")}
              hint="What it is, who it is for and what they will leave with. The agenda and the speakers have a panel of their own." />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static"
              hint="Only a published event is on the site. Archive one to take it off while keeping its registrations.">
              <Select id="status" name="status" defaultValue={event?.status ?? "draft"}>
                {meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>

            <Field label="Featured" htmlFor="is_featured" error={err("is_featured")} variant="float-static"
              hint="A featured event leads the Events page while it is still to come.">
              <Select id="is_featured" name="is_featured" defaultValue={event?.is_featured ? "1" : "0"}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </Select>
            </Field>

            {editing && (
              <p className="text-12-5 text-muted">
                {event!.date_label} · {event!.time_label}
                {event!.is_past && <span className="text-faint"> · ended</span>}
              </p>
            )}
          </aside>
        </div>

        {/* Sections in place of the written body. One child, always mounted. */}
        <RecordSectionsPanel
          state={body}
          builder={builder}
          media={event?.blocks_media ?? {}}
          errors={state.fieldErrors ?? {}}
          bodyField="body"
          storedBody={event?.body ?? ""}
          noun="event"
          keeps="Its heading, date and place, agenda, speakers, registration panel and FAQs stay where they are."
        />

        {/* --------------------------------------------------- When and where */}
        <div className="max-w-[820px]">
          <Field label="Format" htmlFor="format" error={err("format")} variant="float-static"
            hint="In person has a venue, online has a join link, and a hybrid event has both.">
            <Select key={epoch} id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value)}>
              {meta.formats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="starts_at" error={err("starts_at")}
              hint={`In ${zone}, the site's own time — typed as the clock there will read, wherever you are.`}>
              <Input id="starts_at" name="starts_at" type="datetime-local" defaultValue={event?.starts_at ?? ""}
                required aria-invalid={Boolean(err("starts_at"))} />
            </Field>

            <Field label="Ends" htmlFor="ends_at" error={err("ends_at")}
              hint="Optional. Without one the event counts as upcoming until the end of its start day.">
              <Input id="ends_at" name="ends_at" type="datetime-local" defaultValue={event?.ends_at ?? ""}
                aria-invalid={Boolean(err("ends_at"))} />
            </Field>
          </div>

          {/*
            Hidden, not unmounted and not cleared: a venue typed for an
            in-person event is still there if the format comes back to one.
          */}
          <div hidden={!shown(hasVenue, "venue_name", "venue_city", "venue_address", "map_url")}>
            <div className="grid gap-x-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Venue" htmlFor="venue_name" error={err("venue_name")}
                hint="The name of the place — a hall, an office, an exhibition centre.">
                <Input id="venue_name" name="venue_name" defaultValue={event?.venue_name ?? ""} maxLength={160}
                  aria-invalid={Boolean(err("venue_name"))} />
              </Field>

              <Field label="City" htmlFor="venue_city" error={err("venue_city")}>
                <Input id="venue_city" name="venue_city" defaultValue={event?.venue_city ?? ""} maxLength={80}
                  aria-invalid={Boolean(err("venue_city"))} />
              </Field>
            </div>

            <Field label="Address" htmlFor="venue_address" error={err("venue_address")}
              hint="As you would write it on an envelope. Line breaks are kept.">
              <Textarea id="venue_address" name="venue_address" rows={3} defaultValue={event?.venue_address ?? ""}
                maxLength={500} aria-invalid={Boolean(err("venue_address"))} />
            </Field>

            <Field label="Map link" htmlFor="map_url" error={err("map_url")}
              hint="Optional. Where “Open in Maps” goes — a full https:// address.">
              <Input id="map_url" name="map_url" type="url" inputMode="url" autoCapitalize="none" spellCheck={false}
                defaultValue={event?.map_url ?? ""} placeholder="https://maps.google.com/?q=…"
                aria-invalid={Boolean(err("map_url"))} />
            </Field>
          </div>

          <div hidden={!shown(hasLink, "online_url")}>
            <Field label="Join link" htmlFor="online_url" error={err("online_url")}
              hint="Only ever emailed to people who registered — in their confirmation and its calendar file. It is never on the public page. An online or hybrid event that takes registrations here needs one before it can be published.">
              <Input id="online_url" name="online_url" type="url" inputMode="url" autoCapitalize="none" spellCheck={false}
                defaultValue={event?.online_url ?? ""} placeholder="https://meet.example/…"
                aria-invalid={Boolean(err("online_url"))} />
            </Field>
          </div>

          {(!hasVenue || !hasLink) && (
            <p className="text-12-5 text-muted">
              {!hasVenue
                ? "An online event shows no venue. Anything typed for one is kept in case the format changes back."
                : "An in-person event has no join link. Anything typed for one is kept in case the format changes back."}
            </p>
          )}
        </div>

        {/* ------------------------------------------------------ Registration */}
        <div className="max-w-[820px]">
          {editing && counts && (counts.confirmed + counts.waitlisted + counts.cancelled + counts.attended > 0) && (
            <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line-strong bg-surface p-4">
              <SeatMeter counts={counts} capacity={event!.capacity} className="text-13" />
              <p className="text-13 text-muted">
                {counts.confirmed} confirmed
                {counts.cancelled > 0 && <> · {counts.cancelled} cancelled</>}
                {counts.attended > 0 && <> · {counts.attended} attended</>}
              </p>
              <Link href={`/admin/events/${event!.id}/registrations`} className="ml-auto py-1 text-13 font-semibold text-brand-ink hover:underline">
                Open the registrations →
              </Link>
            </div>
          )}

          <Field label="Registration" htmlFor="registration_mode" error={err("registration_mode")} variant="float-static"
            hint={modeBlurb || undefined}>
            <Select key={epoch} id="registration_mode" name="registration_mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {meta.registration_modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>

          <div hidden={!shown(mode === "external", "external_url")}>
            <Field label="Where people register" htmlFor="external_url" error={err("external_url")}
              hint="The full https:// address of the sign-up page. The event's button opens it in a new tab.">
              <Input id="external_url" name="external_url" type="url" inputMode="url" autoCapitalize="none" spellCheck={false}
                defaultValue={event?.external_url ?? ""} placeholder="https://…"
                aria-invalid={Boolean(err("external_url"))} />
            </Field>
          </div>

          <div hidden={!shown(takes, "capacity", "waitlist_enabled", "max_seats", "registration_closes_at")}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Capacity" htmlFor="capacity" error={err("capacity")}
                hint={counts && counts.confirmed_seats > 0
                  ? `Seats in all. Blank for no limit; not below the ${counts.confirmed_seats} already confirmed.`
                  : "Seats in all. Blank for no limit."}>
                <Input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} max={100000} step={1}
                  defaultValue={event?.capacity ?? ""} aria-invalid={Boolean(err("capacity"))} />
              </Field>

              <Field label="Seats per registration" htmlFor="max_seats" error={err("max_seats")}
                hint="The most one person may register for at once, 1 to 20. Blank uses the default from Events → Settings.">
                <Input id="max_seats" name="max_seats" type="number" inputMode="numeric" min={1} max={20} step={1}
                  defaultValue={event?.max_seats ?? ""} aria-invalid={Boolean(err("max_seats"))} />
              </Field>
            </div>

            <label className="mb-[18px] flex items-start gap-2.5 text-13-5">
              <input type="checkbox" name="waitlist_enabled" value="1" defaultChecked={event?.waitlist_enabled ?? false}
                className="mt-0.5 size-4 shrink-0 accent-brand-600" />
              <span>
                Keep a waiting list once it is full
                <span className="mt-0.5 block text-12-5 text-muted">
                  With a capacity set, people who register after the last seat has gone are told they are waiting, and
                  are confirmed and emailed — oldest first — as places open. Off, a full event simply refuses.
                </span>
                {err("waitlist_enabled") && <span className="mt-1 block text-12-5 text-err">{err("waitlist_enabled")}</span>}
              </span>
            </label>

            <Field label="Registration closes" htmlFor="registration_closes_at" error={err("registration_closes_at")}
              hint={`Optional, in ${zone}, and not after the start. Blank keeps it open until the event starts.`}>
              <Input id="registration_closes_at" name="registration_closes_at" type="datetime-local"
                defaultValue={event?.registration_closes_at ?? ""} aria-invalid={Boolean(err("registration_closes_at"))} />
            </Field>
          </div>

          {!takes && mode !== "external" && (
            <p className="text-12-5 text-muted">
              With no registration the page is an announcement: the date, the place and the details, and no form.
            </p>
          )}

          {/*
            Offered only where there is somebody to tell. Never ticked by
            default and never remembered: it is a decision about *this* save.
          */}
          {editing && counts && counts.confirmed > 0 && (
            <label className="mt-2 flex items-start gap-2.5 rounded-lg border border-line-strong bg-surface p-4 text-13-5">
              <input type="checkbox" name="notify_registrants" value="1" className="mt-0.5 size-4 shrink-0 accent-brand-600" />
              <span>
                Tell everyone registered about a change of time or place
                <span className="mt-0.5 block text-12-5 text-muted">
                  Ticked, saving a new start, end, venue or join link emails each of the {counts.confirmed} confirmed{" "}
                  {counts.confirmed === 1 ? "registrant" : "registrants"} what changed, with an updated calendar file.
                  A save that moves none of those sends nothing. Unticked, nobody is emailed.
                </span>
                {err("notify_registrants") && <span className="mt-1 block text-12-5 text-err">{err("notify_registrants")}</span>}
              </span>
            </label>
          )}
        </div>

        {/* --------------------------------------------------------- Programme */}
        <div>
          <AgendaField defaultValue={event?.agenda ?? []} max={meta.max_agenda} errors={state.fieldErrors} />
          <SpeakersField defaultValue={event?.speakers ?? []} max={meta.max_speakers} errors={state.fieldErrors} />
        </div>

        {/* ------------------------------------------------------------- Media */}
        <div className="max-w-[520px]">
          <CoverField
            hint="PNG, JPG, GIF or WebP. 1200 x 630 px — the ratio the event's page and its share card both use."
            description="The picture on the event's card and at the top of its page. An event without one is drawn on the theme's own ground."
            defaultPath={event?.cover_image_path ?? null}
            defaultUrl={event?.cover_image ?? null}
          />
          {err("cover_image_path") && <p className="-mt-2 mb-4 text-12-5 text-err">{err("cover_image_path")}</p>}
        </div>

        {/* -------------------------------------------------------------- FAQs */}
        <FaqField defaultValue={event?.faqs ?? []} error={rowErr("faqs")} />

        {/* --------------------------------------------------------------- SEO */}
        <SeoPanel seo={event?.seo} defaults={event?.seo_defaults} error={seoErr} embedded
          record={event ? { type: "event", id: event.id } : null} />
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create event"}
        </Button>
        <Link href="/admin/events" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deleteEventAction}
              formNoValidate
              // Deleting is irreversible and the button sits next to Save.
              onClick={(e) => {
                if (!window.confirm(`Delete "${event!.title}"? This cannot be undone.`)) e.preventDefault();
              }}
            >
              Delete event
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
