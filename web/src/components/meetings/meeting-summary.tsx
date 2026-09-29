import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { IconArrowRight } from "@/components/icons-ui";
import { LocalTime } from "./local-time";
import type { CustomerMeeting, MeetingStatus } from "@/types/meetings";

type Tone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

/** One colour per meeting state, shared by the guest page and the portal. */
export const meetingStatusTone: Record<MeetingStatus, Tone> = {
  scheduled: "progress",
  completed: "resolved",
  cancelled: "closed",
  no_show: "urgent",
};

export function MeetingStatusBadge({ status, label }: { status: MeetingStatus; label: string }) {
  return <Badge tone={meetingStatusTone[status] ?? "closed"}>{label}</Badge>;
}

const dt = "text-12 font-semibold uppercase tracking-[.06em] text-muted";

/**
 * What a customer needs to see about their own meeting: where it stands,
 * when (in the API's words, with "your time" beside it for somebody
 * elsewhere), with whom, and the way in. A server component; the buttons that
 * change it are `MeetingManage`.
 *
 * The Meet link is only ever on a scheduled meeting — the API sends it null
 * otherwise — and a scheduled one without it is waiting on Google, which the
 * page says rather than leaving a gap.
 */
export function MeetingSummary({ meeting, timezone }: { meeting: CustomerMeeting; timezone: string | null }) {
  const live = meeting.status === "scheduled";

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <dt className={dt}>Status</dt>
        <dd className="mt-1"><MeetingStatusBadge status={meeting.status} label={meeting.status_label} /></dd>
      </div>
      <div className="min-w-0">
        <dt className={dt}>Meeting</dt>
        <dd className="mt-1 text-15">
          {meeting.meeting_type ? `${meeting.meeting_type.name}, ${meeting.meeting_type.minutes} minutes` : "Online meeting"}
        </dd>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <dt className={dt}>{live ? "When" : "Was booked for"}</dt>
        <dd className="mt-1">
          <span className="block text-17 font-semibold">{meeting.date_label}</span>
          <span className="text-15">
            {meeting.time_label} {meeting.timezone}
            {timezone && <LocalTime start={meeting.starts_at} timezone={timezone} className="text-muted" />}
          </span>
        </dd>
      </div>

      {live && (
        <div className="min-w-0 sm:col-span-2">
          <dt className={dt}>Joining</dt>
          <dd className="mt-1.5">
            {meeting.meet_url ? (
              <a
                href={meeting.meet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-13-5 font-semibold text-brand-on shadow-2 transition-colors duration-(--duration-base) hover:bg-brand-700"
              >
                Join on Google Meet <IconArrowRight className="size-4" />
              </a>
            ) : (
              <p className="text-14 text-muted">The Google Meet link will arrive by email, and appear here, shortly.</p>
            )}
          </dd>
        </div>
      )}

      {meeting.host_name && (
        <div className="min-w-0">
          <dt className={dt}>With</dt>
          <dd className="mt-1 text-15">{meeting.host_name}</dd>
        </div>
      )}

      {meeting.status === "cancelled" && meeting.cancel_reason && (
        <div className="min-w-0 sm:col-span-2">
          <dt className={dt}>Why it was cancelled</dt>
          <dd className="mt-1 text-15">{meeting.cancel_reason}</dd>
        </div>
      )}

      {meeting.agenda && (
        <div className="min-w-0 sm:col-span-2">
          <dt className={dt}>What you want to cover</dt>
          <dd className="mt-1 whitespace-pre-line break-words text-15">{meeting.agenda}</dd>
        </div>
      )}
    </dl>
  );
}
