import Link from "next/link";
import { SortTh } from "@/components/admin/sort-th";
import { Badge } from "@/components/ui/badge";
import { GoogleBadge, MeetingStatusBadge, dayLabel, meetingDay } from "./meeting-bits";
import type { AdminMeeting, AdminMeetingIndex } from "@/types/meetings";

/**
 * The meetings as a table — the desk's list and a host's own diary. Cards
 * below `md` through `.admin-table` and a `data-label` on every cell.
 *
 * A column heading sorts only where the API says it can (`meta.sorts`), so a
 * heading never offers an order `ListSort` would ignore.
 */
export function MeetingTable({
  meetings, meta, basePath, params, sort, dir, showHost = true,
}: {
  meetings: AdminMeeting[];
  meta: AdminMeetingIndex["meta"];
  /** `/admin/meetings` or `/admin/my-meetings` — where a row links and a heading sorts. */
  basePath: string;
  params: Record<string, string | undefined>;
  sort?: string;
  dir?: string;
  showHost?: boolean;
}) {
  const sortable = new Set(meta.sorts ?? []);
  const th = (key: string, label: string) =>
    sortable.has(key)
      ? <SortTh sortKey={key} label={label} basePath={basePath} params={params} sort={sort} dir={dir} />
      : <th scope="col" className="px-3 py-1.5">{label}</th>;

  return (
    <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
      <table className="admin-table w-full min-w-[860px] text-left text-13">
        <thead>
          <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
            {th("name", "Contact")}
            <th scope="col" className="px-3 py-1.5">Kind</th>
            {th("starts", "When")}
            {showHost && th("host", "Host")}
            {th("status", "Status")}
            <th scope="col" className="px-3 py-1.5">Google</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <tr key={m.reference} className="border-b border-line last:border-b-0 align-top">
              <td data-label="Contact" className="max-w-[30ch] px-3 py-2">
                <Link href={`${basePath}/${m.reference}`} className="font-medium hover:underline">{m.name}</Link>
                <span className="block truncate font-mono text-12 text-faint">{m.reference}</span>
                {m.company && <span className="block truncate text-12 text-muted">{m.company}</span>}
              </td>
              <td data-label="Kind" className="max-w-[24ch] px-3 py-2">
                <span className="block truncate">{m.meeting_type?.name ?? "—"}</span>
                <span className="block text-12 text-muted">{m.minutes} min · {m.source_label}</span>
              </td>
              <td data-label="When" className="px-3 py-2">
                <span className="whitespace-nowrap font-medium">
                  {m.date_label || dayLabel(meetingDay(m), true)}
                  <span className="block text-12 font-normal text-muted">{m.time_label} {m.timezone}</span>
                </span>
              </td>
              {showHost && (
                <td data-label="Host" className="max-w-[20ch] px-3 py-2 text-muted">
                  <span className="block truncate">{m.host_name ?? "Nobody"}</span>
                </td>
              )}
              <td data-label="Status" className="px-3 py-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <MeetingStatusBadge status={m.status} label={m.status_label} />
                  {m.needs_outcome && <Badge tone="progress">Needs outcome</Badge>}
                </span>
              </td>
              <td data-label="Google" className="px-3 py-2">
                <GoogleBadge google={m.google} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A week as a diary: one block per day, Monday first, each meeting a row
 * with its time, its contact and its host. Days with nothing on say so,
 * because a gap in the week is information too.
 */
export function MeetingAgenda({
  meetings, monday, basePath, today, showHost = true,
}: {
  meetings: AdminMeeting[];
  monday: string;
  basePath: string;
  today: string;
  showHost?: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${monday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <ol className="grid gap-3">
      {days.map((day) => {
        const rows = meetings.filter((m) => meetingDay(m) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

        return (
          <li key={day} className="rounded-lg border border-line-strong bg-card">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-2 text-13 font-semibold">
              {dayLabel(day)}
              {day === today && <Badge tone="brand">Today</Badge>}
              <span className="ml-auto text-12 font-normal text-faint">{rows.length ? `${rows.length} meeting${rows.length === 1 ? "" : "s"}` : ""}</span>
            </h2>
            {rows.length === 0 ? (
              <p className="px-4 py-2.5 text-12-5 text-muted">Nothing booked.</p>
            ) : (
              <ul>
                {rows.map((m) => (
                  <li key={m.reference} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0">
                    <span className="w-[112px] shrink-0 font-mono text-12-5 font-semibold">{m.time_label}</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`${basePath}/${m.reference}`} className="font-medium hover:underline">{m.name}</Link>
                      <span className="block truncate text-12 text-muted">
                        {[m.meeting_type?.name, m.company, showHost ? m.host_name : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <MeetingStatusBadge status={m.status} label={m.status_label} />
                      {m.google.status === "failed" && <GoogleBadge google={m.google} />}
                      {m.meet_url && m.status === "scheduled" && (
                        <a href={m.meet_url} target="_blank" rel="noopener noreferrer" className="text-12-5 font-semibold text-brand-ink underline">
                          Join Meet
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
