import Link from "next/link";
import { BulkBar, RowTick, TickAll } from "@/components/admin/row-selection";
import { bulkEventsAction } from "./actions";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { SortTh } from "@/components/admin/sort-th";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconProjector } from "@/components/icons";
import { getEvents } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { EventRowActions } from "./event-row-actions";
import { SeatMeter } from "./seat-meter";
import { eventStatusTone } from "./event-tones";

export const metadata = buildMetadata({ title: "Events", path: "/admin/events", seo: noIndex });

type SearchParams = {
  q?: string; status?: string; when?: string; format?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

/**
 * Events (docs/events.md): seminars, webinars, demonstrations — anything
 * with a date that people attend.
 *
 * The API's own order is the one an editor works in: what is coming, soonest
 * first, then what has been, newest first. Every date on this screen is the
 * API's label, in the site's zone; nothing here formats one.
 */
export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  let result: Awaited<ReturnType<typeof getEvents>>;
  try {
    result = await getEvents({
      q: params.q, status: params.status, when: params.when, format: params.format,
      sort: params.sort, dir: params.dir,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the events">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const events = result.data;
  const { options } = result;
  const filtered = Boolean(params.q || params.status || params.when || params.format);
  const pageParams: Record<string, string | undefined> = {
    q: params.q, status: params.status, when: params.when, format: params.format,
    sort: params.sort, dir: params.dir, per_page: params.per_page,
  };

  // Where a refused delete or copy returns to: this list, as it is filtered now.
  const here = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...pageParams, page: params.page })) if (value) here.set(key, value);
  const back = here.toString() ? `/admin/events?${here}` : "/admin/events";

  return (
    <>
      <PageHeader
        title="Events"
        lede={<>
          Seminars, webinars, demonstrations and trade shows. Each has a page at <span className="font-mono">/events/…</span> and
          can take registrations, free, with a capacity and a waiting list if you set one. A series is made by
          duplicating: every date is its own event.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/events/new" size="sm">New event</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/events">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title, venue or city…" />
        </FilterField>

        <FilterField label="When" htmlFor="when">
          <Select id="when" name="when" defaultValue={params.when ?? ""}>
            <option value="">Any time</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </Select>
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {options.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Format" htmlFor="format">
          <Select id="format" name="format" defaultValue={params.format ?? ""}>
            <option value="">Any format</option>
            {options.formats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/events" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {events.length === 0 ? (
        <EmptyState
          icon={<IconProjector />}
          title={filtered ? "No events match those filters" : "No events yet"}
          action={filtered ? undefined : <ButtonLink href="/admin/events/new" size="sm">Add the first one</ButtonLink>}
        >
          {filtered
            ? "Try a different combination, or clear the filters."
            : "An event is a draft until you publish it. Published, it appears on the Events page and, if you switch registration on, starts taking names."}
        </EmptyState>
      ) : (
        <>
          <BulkBar scope="events" ids={events.map((event) => event.id)} noun={{ one: "event", many: "events" }} action={bulkEventsAction} deleteNote="An event people have registered for is kept: archive it instead." />
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[960px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="w-8 px-3 py-1.5"><TickAll scope="events" ids={events.map((event) => event.id)} noun="event" /></th>
                <SortTh sortKey="title" label="Event" basePath="/admin/events" params={pageParams} sort={params.sort} dir={params.dir} />
                <SortTh sortKey="starts" label="When" basePath="/admin/events" params={pageParams} sort={params.sort} dir={params.dir} />
                <th scope="col" className="px-3 py-1.5">Format</th>
                <SortTh sortKey="status" label="Status" basePath="/admin/events" params={pageParams} sort={params.sort} dir={params.dir} />
                <th scope="col" className="px-3 py-1.5">Registrations</th>
                <th scope="col" className="px-3 py-1.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const takes = event.registration_mode === "open";
                const held = event.counts.confirmed + event.counts.waitlisted + event.counts.cancelled + event.counts.attended;

                return (
                  <tr key={event.id} className="border-b border-line last:border-b-0 align-top">
                    <td data-label="Select" className="px-3 py-2"><RowTick scope="events" id={event.id} label={event.title} /></td>
                    <td data-label="Event" className="px-3 py-2 md:max-w-[40ch]">
                      <Link href={`/admin/events/${event.id}`} className="text-13-5 font-medium text-ink hover:underline">
                        {event.title}
                      </Link>
                      {event.is_featured && <Badge tone="accent" dot={false} className="ml-2 align-middle">Featured</Badge>}
                      <span className="mt-0.5 block truncate text-12 text-muted">
                        {[event.venue_name, event.venue_city].filter(Boolean).join(", ") || event.format_label}
                      </span>
                    </td>

                    <td data-label="When" className="px-3 py-2">
                      {/* One child: on a phone the cell is a two-column grid, and a second child would land under the label. */}
                      <span className="block min-w-0">
                        <span className="block whitespace-nowrap font-medium max-md:whitespace-normal">{event.date_label}</span>
                        <span className="block text-12 text-muted">
                          {event.time_label}
                          {event.is_past && <span className="text-faint"> · ended</span>}
                        </span>
                      </span>
                    </td>

                    <td data-label="Format" className="px-3 py-2 text-muted">{event.format_label}</td>

                    <td data-label="Status" className="px-3 py-2">
                      <Badge tone={eventStatusTone(event.status)}>{event.status_label}</Badge>
                    </td>

                    <td data-label="Registrations" className="px-3 py-2">
                      {takes || held > 0 ? (
                        <SeatMeter counts={event.counts} capacity={event.capacity} />
                      ) : (
                        <span className="text-muted">
                          {event.registration_mode === "external" ? "On another site" : "Not taken"}
                        </span>
                      )}
                    </td>

                    <td data-label="Manage" className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1 xl:flex-nowrap xl:justify-end">
                        <Link href={`/admin/events/${event.id}`} className="relative rounded px-1.5 py-1 text-12-5 font-semibold text-brand-ink hover:underline">
                          Edit<span className="sr-only"> {event.title}</span>
                        </Link>
                        {(takes || held > 0) && (
                          <Link href={`/admin/events/${event.id}/registrations`} className="relative rounded px-1.5 py-1 text-12-5 font-semibold text-brand-ink hover:underline">
                            Registrations<span className="sr-only"> for {event.title}</span>
                          </Link>
                        )}
                        <EventRowActions id={event.id} title={event.title} back={back} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Pagination meta={result.meta} basePath="/admin/events" params={pageParams} />
    </>
  );
}
