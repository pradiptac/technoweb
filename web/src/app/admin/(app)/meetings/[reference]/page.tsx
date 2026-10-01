import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMeeting, getMeetings } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { MeetingStatusBadge, hasStarted, zoneToday } from "../meeting-bits";
import { MeetingFacts, MeetingTrail } from "../meeting-detail";
import { MeetingCancelPanel, MeetingGooglePanel, MeetingMovePanel, MeetingOutcomePanel } from "../meeting-panels";
import type { AdminMeeting, AdminMeetingIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Meeting", path: "/admin/meetings", seo: noIndex });

export default async function MeetingPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireScreen();
  const { reference } = await params;

  let meeting: AdminMeeting;
  let index: AdminMeetingIndex;

  try {
    // The record, and the meta the panels build their selects from — the
    // API's lists, never ones restated here.
    [meeting, index] = await Promise.all([getMeeting(reference), getMeetings({ per_page: 1 })]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that meeting">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const scheduled = meeting.status === "scheduled";
  const started = hasStarted(meeting.starts_at);
  const typeSlug = meeting.meeting_type?.slug ?? index.meta.types.find((t) => t.id === meeting.meeting_type_id)?.slug ?? "";

  return (
    <>
      <PageHeader title={meeting.name} back={{ href: "/admin/meetings", label: "Meetings" }}>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-mono text-13 text-muted">{meeting.reference}</span>
          <MeetingStatusBadge status={meeting.status} label={meeting.status_label} />
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <MeetingFacts meeting={meeting} />
          <MeetingTrail meeting={meeting} timeZone={index.meta.timezone} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <MeetingOutcomePanel key={`${meeting.status}:${meeting.updated_at}`} meeting={meeting} started={started} />
          <MeetingGooglePanel meeting={meeting} />
          {scheduled && typeSlug && (
            <MeetingMovePanel meeting={meeting} typeSlug={typeSlug} hosts={index.meta.hosts} minDate={zoneToday(index.meta.timezone)} />
          )}
          {scheduled && <MeetingCancelPanel meeting={meeting} />}
        </div>
      </div>
    </>
  );
}
