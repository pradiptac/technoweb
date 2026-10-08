import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconMeeting } from "@/components/icons";
import { MeetingStatusBadge } from "@/components/meetings/meeting-summary";
import { getMyMeetings } from "@/lib/meetings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Paginated } from "@/types/api";
import type { CustomerMeeting } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Your meetings", path: "/portal/meetings", seo: noIndex });

/** The customer's own online meetings (docs/meetings.md), newest first. */
export default async function PortalMeetingsPage() {
  let meetings: Paginated<CustomerMeeting>;

  try {
    meetings = await getMyMeetings();
  } catch {
    return (
      <ErrorState title="We could not load your meetings">
        Try again shortly, or call us and we will look them up.
      </ErrorState>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h2 className="display-3 mb-1">Your meetings</h2>
          <p className="measure text-14 text-muted">
            Video calls you have booked while signed in. A meeting booked without signing in is
            reachable from the link in its email.
          </p>
        </div>
        <Link href="/book-a-meeting"
          className="ml-auto inline-flex items-center rounded bg-brand-600 px-4 py-[11px] text-13-5 font-semibold text-brand-on shadow-2 hover:bg-brand-700">
          Book a meeting
        </Link>
      </div>

      {meetings.data.length === 0 ? (
        <EmptyState icon={<IconMeeting />} title="No meetings yet">
          <span className="block">
            Want to talk it through? <Link className="underline" href="/book-a-meeting">Book a meeting</Link>.
          </span>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {meetings.data.map((meeting) => (
            <li key={meeting.reference} className="rounded-lg border border-line-strong bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/portal/meetings/${meeting.reference}`} className="font-mono text-13-5 font-medium hover:underline">
                  {meeting.reference}
                </Link>
                <MeetingStatusBadge status={meeting.status} label={meeting.status_label} />
                <span className="min-w-0 text-14">{meeting.meeting_type?.name ?? "Online meeting"}</span>
              </div>
              <p className="mt-1 text-12-5 text-muted">
                {meeting.date_label}, {meeting.time_label} {meeting.timezone}
                {meeting.host_name ? ` · with ${meeting.host_name}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
