import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconMeeting } from "@/components/icons";
import { getMeetings } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { cn } from "@/lib/utils";
import { addDays, dayLabel, isBareDate, mondayOf, zoneToday } from "./meeting-bits";
import { MeetingAgenda, MeetingTable } from "./meeting-table";
import type { AdminMeetingIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Meetings", path: "/admin/meetings", seo: noIndex });

type SearchParams = {
  q?: string; status?: string; host?: string; type?: string; mine?: string; from?: string; to?: string;
  needs_outcome?: string; google?: string; sort?: string; dir?: string; page?: string; per_page?: string;
  view?: string; week?: string;
};

/**
 * Online meetings (docs/meetings.md): the list the desk works, and the same
 * meetings as a week's diary (`?view=agenda`). Both read `GET /admin/meetings`;
 * the agenda asks for one week, soonest first, and draws it by day.
 */
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;
  const agenda = params.view === "agenda";

  const filters = {
    q: params.q, status: params.status, host: params.host, type: params.type,
    mine: params.mine === "1", needs_outcome: params.needs_outcome === "1",
    google: params.google === "failed" ? "failed" : undefined,
  };

  let result: AdminMeetingIndex;
  let monday = "";
  let today = "";

  try {
    if (agenda) {
      // The week needs the app's "today", which is the API's to say.
      const probe = await getMeetings({ per_page: 1 });
      today = zoneToday(probe.meta.timezone);
      monday = mondayOf(isBareDate(params.week) ? params.week : today);
      result = await getMeetings({ ...filters, from: monday, to: addDays(monday, 6), sort: "starts", dir: "asc", per_page: 100 });
    } else {
      result = await getMeetings({
        ...filters, from: params.from, to: params.to, sort: params.sort, dir: params.dir,
        page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
      });
      today = zoneToday(result.meta.timezone);
    }
  } catch {
    return (
      <ErrorState title="We could not load the meetings">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { meta } = result;
  const filtered = Boolean(params.q || params.status || params.host || params.type || params.mine || params.from
    || params.to || params.needs_outcome || params.google);
  const listParams = {
    q: params.q, status: params.status, host: params.host, type: params.type, mine: params.mine,
    from: params.from, to: params.to, needs_outcome: params.needs_outcome, google: params.google,
    sort: params.sort, dir: params.dir, per_page: params.per_page,
  };

  /** The same filters with the view and the week swapped. */
  const link = (extra: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const base = { q: params.q, status: params.status, host: params.host, type: params.type, mine: params.mine };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) query.set(k, v);
    const qs = query.toString();
    return `/admin/meetings${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Meetings"
        lede={<>
          Google Meet calls with customers, booked from the website, the portal or here. Every meeting has a host,
          and nobody is ever booked twice at once. Times are in {meta.timezone_label}.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/meetings/new" size="sm">Schedule a meeting</ButtonLink>
        </div>
      </PageHeader>

      {/* List or diary — two links, so the view is in the URL and survives a reload. */}
      <nav aria-label="View" className="mb-4 inline-flex rounded border border-line-strong bg-card p-0.5 text-13">
        {[
          { href: link({ view: undefined }), label: "List", on: !agenda },
          { href: link({ view: "agenda" }), label: "Agenda", on: agenda },
        ].map((v) => (
          <Link
            key={v.label}
            href={v.href}
            aria-current={v.on ? "page" : undefined}
            className={cn(
              "rounded-sm px-3 py-1.5 font-semibold transition-colors duration-(--duration-fast)",
              v.on ? "bg-brand-600 text-brand-on" : "text-muted hover:text-ink",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <FilterBar action="/admin/meetings">
        {agenda && <input type="hidden" name="view" value="agenda" />}
        {agenda && <input type="hidden" name="week" value={monday} />}

        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Reference, name, email, company…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Host" htmlFor="host">
          <Select id="host" name="host" defaultValue={params.host ?? ""}>
            <option value="">Anyone</option>
            {meta.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </FilterField>

        <FilterField label="Kind" htmlFor="type">
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">Any kind</option>
            {meta.types.map((t) => <option key={t.id} value={t.slug}>{t.name}{t.is_active ? "" : " (off)"}</option>)}
          </Select>
        </FilterField>

        {!agenda && (
          <>
            <FilterField label="From" htmlFor="from">
              <Input id="from" name="from" type="date" defaultValue={params.from} />
            </FilterField>
            <FilterField label="To" htmlFor="to">
              <Input id="to" name="to" type="date" defaultValue={params.to} />
            </FilterField>
          </>
        )}

        <FilterField label="Show" htmlFor="show_mine">
          <Select id="show_mine" name="mine" defaultValue={params.mine ?? ""}>
            <option value="">Everyone&apos;s</option>
            <option value="1">Mine</option>
          </Select>
        </FilterField>

        {params.needs_outcome === "1" && <input type="hidden" name="needs_outcome" value="1" />}
        {params.google === "failed" && <input type="hidden" name="google" value="failed" />}

        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href={agenda ? "/admin/meetings?view=agenda" : "/admin/meetings"} variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {/*
        The figures somebody acts on, counted over the whole table rather than
        the page, each linking to the query that produced it.
      */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-13 text-muted">
        {meta.today_count > 0 && (
          <p>
            <Link href={`/admin/meetings?status=scheduled&from=${today}&to=${today}`} className="font-semibold text-brand-ink underline">
              {meta.today_count} today
            </Link>
          </p>
        )}
        {meta.needs_outcome_count > 0 && params.needs_outcome !== "1" && (
          <p>
            <Link href="/admin/meetings?needs_outcome=1" className="font-semibold text-warn underline">
              {meta.needs_outcome_count} need an outcome
            </Link>
          </p>
        )}
        {meta.google_failed_count > 0 && params.google !== "failed" && (
          <p>
            <Link href="/admin/meetings?google=failed" className="font-semibold text-err underline">
              {meta.google_failed_count} not in Google Calendar
            </Link>
          </p>
        )}
        {params.needs_outcome === "1" && <p>Showing meetings that are over and still owed an outcome.</p>}
        {params.google === "failed" && <p>Showing meetings whose Google sync failed.</p>}
      </div>

      {agenda ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <ButtonLink href={link({ view: "agenda", week: addDays(monday, -7) })} variant="secondary" size="sm">← Previous week</ButtonLink>
            <p className="text-13-5 font-semibold">
              {dayLabel(monday)} – {dayLabel(addDays(monday, 6), true)}
            </p>
            <ButtonLink href={link({ view: "agenda", week: addDays(monday, 7) })} variant="secondary" size="sm">Next week →</ButtonLink>
            {mondayOf(today) !== monday && (
              <Link href={link({ view: "agenda" })} className="text-13 font-semibold text-brand-ink underline">This week</Link>
            )}
          </div>
          <MeetingAgenda meetings={result.data} monday={monday} basePath="/admin/meetings" today={today} />
          {meta.total > result.data.length && (
            <p className="mt-3 text-12-5 text-muted">
              Showing the first {result.data.length} of {meta.total}. Narrow it with a host or a kind.
            </p>
          )}
        </>
      ) : result.data.length === 0 ? (
        <EmptyState icon={<IconMeeting />} title={filtered ? "Nothing matches those filters" : "No meetings yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Bookings from the Book a meeting page, the customer portal and this console appear here."}
        </EmptyState>
      ) : (
        <MeetingTable meetings={result.data} meta={meta} basePath="/admin/meetings" params={listParams} sort={params.sort} dir={params.dir} />
      )}

      {!agenda && <Pagination meta={meta} basePath="/admin/meetings" params={listParams} />}
    </>
  );
}
