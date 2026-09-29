import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { EVENT_WORDS, Fact, GoogleBadge } from "./meeting-bits";
import type { AdminMeeting } from "@/types/meetings";

/**
 * The record's facts and its trail — the desk's screen and a host's own
 * both draw these; what differs is the panels beside them.
 */
export function MeetingFacts({ meeting, links = true }: { meeting: AdminMeeting; links?: boolean }) {
  return (
    <>
      <Card as="section" interactive={false} padding="sm">
        <h2 className="mb-3 text-13 font-semibold">The meeting</h2>

        {meeting.meet_url && meeting.status === "scheduled" && (
          <p className="mb-4">
            <a
              href={meeting.meet_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center rounded bg-brand-600 px-4 text-13-5 font-semibold text-brand-on hover:brightness-110"
            >
              Join Meet
            </a>
            <span className="ml-3 break-all font-mono text-12 text-muted">{meeting.meet_url}</span>
          </p>
        )}

        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Kind">{meeting.meeting_type ? `${meeting.meeting_type.name}, ${meeting.minutes} min` : `${meeting.minutes} min`}</Fact>
          <Fact label="When">{`${meeting.date_label}, ${meeting.time_label} ${meeting.timezone}`}</Fact>
          <Fact label="Host">{meeting.host_name ?? "Nobody — reassign by moving it"}</Fact>
          <Fact label="Booked from">{meeting.source_label}</Fact>
          <Fact label="Moved">{meeting.reschedule_count > 0 ? `${meeting.reschedule_count} time${meeting.reschedule_count === 1 ? "" : "s"}` : null}</Fact>
          <Fact label="Cancelled because">{meeting.status === "cancelled" ? meeting.cancel_reason || "No reason given" : null}</Fact>
          <Fact label="Google">{<GoogleBadge google={meeting.google} />}</Fact>
          {meeting.needs_outcome && <Fact label="Outcome"><Badge tone="progress">Needs an outcome</Badge></Fact>}
        </dl>

        <h3 className="mt-4 mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">Agenda</h3>
        {meeting.agenda ? (
          // Plain text, never markup: often written by a stranger on a public form.
          <p className="whitespace-pre-wrap text-13">{meeting.agenda}</p>
        ) : (
          <p className="text-13 text-muted">None given.</p>
        )}
      </Card>

      <Card as="section" interactive={false} padding="sm">
        <h2 className="mb-3 text-13 font-semibold">Contact</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Name">{meeting.name}</Fact>
          <Fact label="Company">{meeting.company}</Fact>
          <Fact label="Email"><a href={`mailto:${meeting.email}`} className="text-brand-ink underline">{meeting.email}</a></Fact>
          <Fact label="Mobile">
            {meeting.phone ? <a href={`tel:${meeting.phone.replace(/[^\d+]/g, "")}`} className="text-brand-ink underline">{meeting.phone}</a> : null}
          </Fact>
          {links && (
            <>
              <Fact label="Portal account">
                {meeting.customer_id ? <Link href={`/admin/customers/${meeting.customer_id}`} className="text-brand-ink underline">Open the customer</Link> : "Guest"}
              </Fact>
              <Fact label="Lead">{meeting.lead_id ? <Link href={`/admin/leads/${meeting.lead_id}`} className="text-brand-ink underline">Open the lead</Link> : null}</Fact>
            </>
          )}
          <Fact label="Booked on">{meeting.source_path ? <span className="font-mono text-12">{meeting.source_path}</span> : null}</Fact>
          <Fact label="Received">{formatDate(meeting.created_at, "dateTime")}</Fact>
        </dl>
      </Card>
    </>
  );
}

/** The trail, oldest first — read as a story. Times in the app's timezone. */
export function MeetingTrail({ meeting, timeZone }: { meeting: AdminMeeting; timeZone: string }) {
  const events = meeting.trail ?? [];
  const when = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
    } catch {
      return formatDate(iso, "dateTime");
    }
  };

  return (
    <Card as="section" interactive={false} padding="sm">
      <h2 className="mb-3 text-13 font-semibold">History</h2>
      {events.length === 0 ? (
        <p className="text-13 text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-line-strong pl-3">
              <p className="text-12 text-faint">
                {e.actor_name || (e.type.startsWith("google") || e.type === "reminded" ? "System" : "Customer")}
                {e.created_at && ` · ${when(e.created_at)}`}
              </p>
              <p className="text-13">
                <span className="font-semibold">{EVENT_WORDS[e.type] ?? e.type}</span>
                {(e.from || e.to) && <span className="text-muted"> {e.from ? `${e.from} → ` : ""}{e.to}</span>}
              </p>
              {e.note && <p className="whitespace-pre-wrap text-13 text-muted">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
