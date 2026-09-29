import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty";
import { MeetingSummary } from "@/components/meetings/meeting-summary";
import { MeetingManage } from "@/components/meetings/meeting-manage";
import { ApiError } from "@/lib/api";
import { getMeetingOptions, getMyMeeting, isMeetingReference } from "@/lib/meetings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cancelMyMeetingAction, rescheduleMyMeetingAction } from "../actions";
import type { CustomerMeeting } from "@/types/meetings";

export const metadata = buildMetadata({ title: "Your meeting", path: "/portal/meetings", seo: noIndex });

export default async function PortalMeetingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!isMeetingReference(reference)) notFound();

  let meeting: CustomerMeeting;

  try {
    meeting = await getMyMeeting(reference);
  } catch (error) {
    // Another customer's meeting is a 404 from the API, never a 403.
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that meeting">
        Try again shortly, or call us and we will look it up.
      </ErrorState>
    );
  }

  const options = await getMeetingOptions().catch(() => null);

  return (
    <>
      <p className="mb-2 text-13">
        <Link href="/portal/meetings" className="text-brand-ink underline">← Your meetings</Link>
      </p>
      <h1 className="display-3 mb-4">Meeting <span className="font-mono">{meeting.reference}</span></h1>

      <div className="grid max-w-4xl gap-6">
        <Card as="section" interactive={false}>
          <h2 className="sr-only">The meeting</h2>
          <MeetingSummary meeting={meeting} timezone={options?.timezone ?? null} />
        </Card>

        <MeetingManage
          meeting={meeting}
          options={options}
          cancelAction={cancelMyMeetingAction.bind(null, meeting.reference)}
          rescheduleAction={rescheduleMyMeetingAction.bind(null, meeting.reference)}
        />
      </div>
    </>
  );
}
