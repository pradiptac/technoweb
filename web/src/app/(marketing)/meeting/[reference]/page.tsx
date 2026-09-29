import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Card } from "@/components/ui/card";
import { MeetingSummary } from "@/components/meetings/meeting-summary";
import { MeetingManage } from "@/components/meetings/meeting-manage";
import { getGuestMeeting, getMeetingOptions, isMeetingReference, meetingGuestToken } from "@/lib/meetings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getSiteSettings } from "@/lib/settings";
import { portalEnabled } from "@/lib/site-settings";
import { cancelGuestMeetingAction, rescheduleGuestMeetingAction } from "./actions";
import type { CustomerMeeting } from "@/types/meetings";

/**
 * One person's meeting, opened by a secret in a cookie. Nothing here may be
 * cached, and there is deliberately no `generateStaticParams`: this route
 * reads a cookie, which inside a cached `[slug]` render is a 500.
 */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Your meeting", path: "/meeting", seo: noIndex });

/**
 * A guest's own meeting (docs/meetings.md). Reached through the link in the
 * email — or the booking's success panel — both of which leave the token in
 * a cookie scoped to this path, so the address bar never holds it. No
 * cookie, a wrong one or a wrong reference is the same not-found.
 */
export default async function GuestMeetingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!isMeetingReference(reference)) notFound();

  const token = await meetingGuestToken(reference);
  if (!token) notFound();

  let meeting: CustomerMeeting;

  try {
    meeting = await getGuestMeeting(reference, token);
  } catch {
    notFound();
  }

  const [options, settings] = await Promise.all([getMeetingOptions().catch(() => null), getSiteSettings()]);

  return (
    <>
      <PageHero
        section="support"
        kicker="Online meeting"
        title={`Meeting ${meeting.reference}`}
        crumbs={[{ name: "Book a meeting", path: "/book-a-meeting" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid max-w-4xl gap-6">
            <Card as="section" interactive={false}>
              <h2 className="sr-only">Your meeting</h2>
              <MeetingSummary meeting={meeting} timezone={options?.timezone ?? null} />
            </Card>

            <MeetingManage
              meeting={meeting}
              options={options}
              cancelAction={cancelGuestMeetingAction.bind(null, meeting.reference)}
              rescheduleAction={rescheduleGuestMeetingAction.bind(null, meeting.reference)}
            />

            {/* Not while the portal is switched off (`portal_enabled`). */}
            {portalEnabled(settings) && (
              <p className="text-14 text-muted">
                Meetings booked while signed in to the portal are listed under{" "}
                <Link href="/portal/meetings" className="font-semibold text-brand-ink underline">My meetings</Link>.
              </p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
