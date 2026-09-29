import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMyMeeting, getMyMeetings } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { MeetingStatusBadge, hasStarted } from "../../meetings/meeting-bits";
import { MeetingFacts, MeetingTrail } from "../../meetings/meeting-detail";
import { MeetingOutcomePanel } from "../../meetings/meeting-panels";
import type { AdminMeeting, AdminMeetingIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Meeting", path: "/admin/my-meetings", seo: noIndex });

/**
 * One of a host's own meetings: the facts, Join Meet, and the outcome and
 * notes. Moving and cancelling are the desk's (`/admin/meetings`); another
 * host's meeting is a 404 from the API.
 */
export default async function MyMeetingPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireScreen();
  const { reference } = await params;

  let meeting: AdminMeeting;
  let index: AdminMeetingIndex;

  try {
    [meeting, index] = await Promise.all([getMyMeeting(reference), getMyMeetings({ per_page: 1 })]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that meeting">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const started = hasStarted(meeting.starts_at);

  return (
    <>
      <PageHeader title={meeting.name} back={{ href: "/admin/my-meetings", label: "My meetings" }}>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-mono text-13 text-muted">{meeting.reference}</span>
          <MeetingStatusBadge status={meeting.status} label={meeting.status_label} />
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <MeetingFacts meeting={meeting} links={false} />
          <MeetingTrail meeting={meeting} timeZone={index.meta.timezone} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <MeetingOutcomePanel key={`${meeting.status}:${meeting.updated_at}`} meeting={meeting} started={started} mine />
          <p className="text-12-5 text-muted">
            To move or cancel it, ask the desk — it is on their Meetings list as {meeting.reference}.
          </p>
        </div>
      </div>
    </>
  );
}
