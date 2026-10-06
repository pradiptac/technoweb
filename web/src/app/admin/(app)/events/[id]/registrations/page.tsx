import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { StatTile } from "@/components/admin/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconClock, IconProjector, IconUsers } from "@/components/icons";
import { IconCheck, IconClose, IconDownload } from "@/components/icons-ui";
import { ApiError } from "@/lib/api";
import { getEventRegistrations, getEventWithMeta, type AdminEvent, type EventRegistrationIndex } from "@/lib/admin";
import { getCurrentStaff } from "@/lib/admin-auth";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate, formatTableDate } from "@/lib/dates";
import { requireScreen } from "@/lib/admin-screen";
import { permits } from "@/app/admin/(app)/nav-items";
import { eventStatusTone } from "../../event-tones";
import { SeatMeter } from "../../seat-meter";
import { AddRegistration } from "./add-registration";
import { RegistrationRowActions, RegistrationStatusCell } from "./registration-row";

export const metadata = buildMetadata({ title: "Registrations", path: "/admin/events", seo: noIndex });

type SearchParams = { status?: string; q?: string; page?: string; per_page?: string };

/** What the status filter offers when the API sends no list of its own. */
const STATUS_FALLBACK = [
  { value: "confirmed", label: "Confirmed" },
  { value: "waitlisted", label: "On the waiting list" },
  { value: "cancelled", label: "Cancelled" },
  { value: "attended", label: "Attended" },
  { value: "no_show", label: "No-show" },
];

/**
 * Who has registered for one event (docs/events.md).
 *
 * The one events screen the sales desk works too — every registration files
 * a lead — so it is gated on `content_manager,sales_manager` (`SCREEN_GATES`
 * in nav-items.tsx) and is careful about what it links to: the event's own
 * form is an editor's, the lead is the sales desk's, and a link is drawn
 * only for a role that can open what it points at.
 *
 * **What is known about the event comes from this list's own `meta.event`**
 * — its title, its date, its counts and its capacity — because that is all a
 * sales manager is entitled to: the event's read is an editor's and would
 * answer 403. Where the account *is* an editor's, that read is asked for as
 * well and fills in what `meta.event` does not carry (the time, the status,
 * the seats-per-registration limit, whether it has ended); it is allowed to
 * fail, and the screen is complete without it.
 *
 * The order is the API's: confirmed first, then the waiting list oldest
 * first — the order places are given in — then the rest.
 */
export default async function EventRegistrationsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireScreen();
  const { id } = await params;
  const sp = await searchParams;

  if (!/^\d+$/.test(id)) notFound();
  const eventId = Number(id);

  // Already fetched by `requireScreen()` and cached for the request.
  const roles = (await getCurrentStaff())?.roles.map((r) => r.slug) ?? [];
  const canEdit = permits(roles, "content_manager");
  const canLeads = permits(roles, "sales_manager");

  let result: EventRegistrationIndex;
  let record: AdminEvent | null;
  try {
    [result, record] = await Promise.all([
      getEventRegistrations(eventId, {
        status: sp.status, q: sp.q, page: Number(sp.page) || 1, per_page: Number(sp.per_page) || undefined,
      }),
      canEdit ? getEventWithMeta(eventId).then((r) => r.event, () => null) : null,
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <ErrorState title="We could not load the registrations">
        {error instanceof ApiError && error.status === 403
          ? "Your account cannot open an event's registrations."
          : "The admin API is not responding. Try again shortly."}
      </ErrorState>
    );
  }

  const event = result.meta.event;
  const registrations = result.data;
  const statuses = result.meta.statuses?.length ? result.meta.statuses : STATUS_FALLBACK;
  const { counts, capacity } = event;

  // `meta.event` first — it is this list's own — then the event's read.
  const timeLabel = event.time_label ?? record?.time_label ?? null;
  const formatLabel = event.format_label ?? record?.format_label ?? null;
  const status = event.status ?? record?.status ?? null;
  const statusLabel = event.status_label ?? record?.status_label ?? null;
  const maxSeats = event.max_seats ?? record?.max_seats ?? null;
  const waitlist = event.waitlist_enabled ?? record?.waitlist_enabled ?? null;
  const ended = event.is_past ?? record?.is_past ?? null;

  /*
    Whether the event has started is the API's to say, never this server's
    clock or the browser's. `has_started` when it is sent; an event that has
    ended has certainly started; anything else is unknown — and unknown
    offers Attended and No-show and lets the API refuse them in its own
    words, under the select. (An event that has started and not ended is in
    that case, and it is the one where marking attendance matters most.)
  */
  const started = event.has_started ?? (ended === true ? true : null);
  const full = capacity !== null && counts.confirmed_seats >= capacity;
  const held = counts.confirmed + counts.waitlisted + counts.cancelled + counts.attended;
  const filtered = Boolean(sp.status || sp.q);
  const pageParams: Record<string, string | undefined> = { status: sp.status, q: sp.q, per_page: sp.per_page };
  const base = `/admin/events/${eventId}/registrations`;

  return (
    <>
      <PageHeader
        back={canEdit ? { href: `/admin/events/${eventId}`, label: "The event" } : undefined}
        title="Registrations"
        lede={<>
          <span className="font-semibold text-ink">{event.title}</span>
          {" · "}{event.date_label}
          {timeLabel ? <>{" · "}{timeLabel}</> : null}
          {formatLabel ? <>{" · "}{formatLabel}</> : null}
        </>}
      >
        {status && statusLabel && <Badge tone={eventStatusTone(status)}>{statusLabel}</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {held > 0 && (
            /*
              A plain `<a download>`, never a `Link`: a link to a route
              handler is prefetched, and this one builds the whole file each
              time it is asked.
            */
            <a
              href={`/api/admin/events/${eventId}/registrations/export`}
              download
              className="inline-flex items-center gap-1.5 rounded border border-line-strong bg-card px-3 py-2 text-13 font-semibold text-ink hover:bg-surface-2"
            >
              <IconDownload className="size-4" aria-hidden="true" />
              Export CSV
            </a>
          )}
          <AddRegistration eventId={eventId} maxSeats={maxSeats} full={full} waitlist={waitlist} />
        </div>
      </PageHeader>

      {/*
        The figures, counted over the whole event rather than the page. The
        first is seats — a registration may hold several, and the capacity is
        a number of chairs — and the rest are registrations. Each tile with
        something behind it is a link to the rows that produced its number.
      */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* On the card's own ground whether or not it is full: the meter says "Full" in the one pairing that is measured. */}
        <div className="col-span-2 min-w-0 rounded-lg border border-line-strong bg-card p-4 lg:col-span-1">
          <p className="text-13 text-ink-2">Confirmed seats</p>
          <SeatMeter counts={counts} capacity={capacity} wide className="mt-1.5 text-15" />
          <p className="mt-1.5 text-12 text-muted">
            {counts.confirmed} {counts.confirmed === 1 ? "registration" : "registrations"}
            {counts.seats_left !== null && !full && <> · {counts.seats_left} left</>}
          </p>
        </div>
        <StatTile
          label="On the waiting list" value={String(counts.waitlisted)}
          tone={counts.waitlisted > 0 ? "warn" : "neutral"} icon={IconClock}
          href={counts.waitlisted > 0 ? `${base}?status=waitlisted` : undefined}
        />
        <StatTile
          label="Cancelled" value={String(counts.cancelled)} tone="neutral" icon={IconClose}
          href={counts.cancelled > 0 ? `${base}?status=cancelled` : undefined}
        />
        {/* Full width below `lg`, like the seats tile: two across leaves a fourth tile alone on half a row. */}
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <StatTile
            label="Attended" value={started === true || counts.attended > 0 ? String(counts.attended) : "—"}
            note={started === true || counts.attended > 0 ? undefined : "Marked once the event has started"}
            tone={counts.attended > 0 ? "ok" : "neutral"} icon={IconCheck}
            href={counts.attended > 0 ? `${base}?status=attended` : undefined}
          />
        </div>
      </div>

      <FilterBar action={base}>
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={sp.q} placeholder="Name, email, company, phone…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Any status</option>
            {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href={base} variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {registrations.length === 0 ? (
        <EmptyState
          icon={filtered ? <IconUsers /> : <IconProjector />}
          title={filtered ? "Nobody matches those filters" : "Nobody has registered yet"}
        >
          {filtered
            ? "Try a different term, or clear the filters."
            : "Registrations from the event's page appear here as they arrive, each with the lead it filed. Somebody who registered another way can be added with the button above."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[1040px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Who</th>
                <th scope="col" className="px-3 py-1.5">Contact</th>
                <th scope="col" className="px-3 py-1.5">Seats</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Note</th>
                <th scope="col" className="px-3 py-1.5">Registered</th>
                <th scope="col" className="px-3 py-1.5">Lead</th>
                <th scope="col" className="px-3 py-1.5"><span className="sr-only">Manage</span></th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Who" className="px-3 py-2 md:max-w-[26ch]">
                    <span className="block text-13-5 font-medium text-ink [overflow-wrap:anywhere]">{r.name}</span>
                    {r.company && <span className="block truncate text-12 text-muted">{r.company}</span>}
                    {r.source === "staff" && <span className="block text-12 text-faint">Added by the desk</span>}
                  </td>

                  {/*
                    Every cell below holds one child. On a phone a cell is a
                    two-column grid — its label, then its content — so a second
                    child would start a new row under the label.
                  */}
                  <td data-label="Contact" className="px-3 py-2 md:max-w-[30ch]">
                    <span className="block min-w-0">
                      {/* `py-1` on each: two stacked links under 24px tall would fail the tap-target spacing rule against each other. */}
                      <a href={`mailto:${r.email}`} className="block py-1 text-brand-ink hover:underline [overflow-wrap:anywhere]">{r.email}</a>
                      {r.phone && (
                        <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="block py-1 font-mono text-12 text-muted hover:underline">
                          {r.phone}
                        </a>
                      )}
                    </span>
                  </td>

                  <td data-label="Seats" className="px-3 py-2 tabular-nums">{r.seats}</td>

                  {/* Keyed on the status, so a refreshed row starts from what the API now says. */}
                  <RegistrationStatusCell
                    key={`${r.id}:${r.status}`} eventId={eventId} registration={r} statuses={statuses} started={started}
                  />

                  <td data-label="Note" className="px-3 py-2 md:max-w-[34ch]">
                    <span className="block min-w-0">
                      {/* A stranger's words: rendered as text, never as markup. */}
                      {r.note && <span className="block whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{r.note}</span>}
                      {r.staff_note && (
                        <span className="mt-1 block whitespace-pre-wrap text-12 text-ink-2 [overflow-wrap:anywhere]">
                          <span className="font-semibold">Desk: </span>{r.staff_note}
                        </span>
                      )}
                      {!r.note && !r.staff_note && <span className="text-faint">—</span>}
                    </span>
                  </td>

                  <td data-label="Registered" className="px-3 py-2 text-muted" title={formatDate(r.created_at, "dateTime")}>
                    <span className="block whitespace-nowrap">
                      {formatTableDate(r.created_at)}
                      {r.cancelled_at && <span className="block text-12 text-faint">Cancelled {formatTableDate(r.cancelled_at)}</span>}
                    </span>
                  </td>

                  <td data-label="Lead" className="px-3 py-2">
                    {r.lead_id === null ? (
                      <span className="text-faint">—</span>
                    ) : canLeads ? (
                      // Built from the id: the console's own route, not a path spelled by the API.
                      <Link href={`/admin/leads/${r.lead_id}`} className="inline-block py-1 font-semibold text-brand-ink hover:underline">
                        Lead #{r.lead_id}
                      </Link>
                    ) : (
                      <span className="text-muted">Filed</span>
                    )}
                  </td>

                  <RegistrationRowActions
                    eventId={eventId} registration={r} maxSeats={maxSeats}
                    query={{ status: sp.status, q: sp.q, page: sp.page, per_page: sp.per_page }}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath={base} params={pageParams} />
    </>
  );
}
