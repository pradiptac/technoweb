import type { ComponentProps, ReactNode } from "react";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { RegistrationManage } from "@/components/events/registration-manage";
import { cancelEventRegistrationAction } from "@/components/events/actions";
import { isRegistrationToken } from "@/components/events/data";
import { ApiError, eventApi } from "@/lib/api";
import { noIndex } from "@/lib/no-index";
import { buildMetadata } from "@/lib/seo";
import type { EventRegistration, EventRegistrationStatus } from "@/types/events";

/**
 * One person's registration, opened by the link in their confirmation email
 * (`GET /events/registrations/{token}`, docs/events-contract.md).
 *
 * **The token in the address is the key**, so this page is treated the way
 * the unsubscribe and the back-in-stock cancel pages are: `noindex`, listed
 * in `SECRET_PATHS` so no analytics tag loads on it, sent with
 * `Referrer-Policy: no-referrer` (`next.config.ts`) so nothing it links to is
 * told the URL, disallowed in `robots.txt`, and never answered by the service
 * worker. The breadcrumb trail names the events index and stops — the trail
 * is also structured data, and this page's own address must not be in it.
 *
 * Deliberately dynamic, with no `generateStaticParams`: the render reads one
 * person's registration, and a cached copy would go on saying "Confirmed"
 * after they cancelled.
 *
 * What it shows is what the link justifies: the event, the status, the
 * number of places and the name they were booked under. No email, phone or
 * note — the API does not send them to a page addressed by a URL.
 *
 * A token that is not 64 hex characters is not sent to the API at all, and
 * one nobody holds is the API's 404; both are this site's not-found page.
 */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Your event registration", path: "/events/registration", seo: noIndex });

type Tone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

/** One colour per state, in the tones the visit and order pages already use for the same meanings. */
const TONE: Record<EventRegistrationStatus, Tone> = {
  confirmed: "resolved",
  waitlisted: "progress",
  cancelled: "closed",
  attended: "resolved",
  no_show: "closed",
};

/** What happens next, in a sentence, for the states where something does. */
function nextStep(registration: EventRegistration): { tone: "info" | "ok" | "warn"; title: string; body: string } | null {
  if (registration.status === "cancelled") {
    return {
      tone: "info",
      title: "This registration is cancelled",
      body: registration.event.is_past
        ? "Nothing more is needed."
        : "Your place has been released. If you change your mind you can register again from the event's page while places remain.",
    };
  }
  if (registration.event.is_past) return null;
  if (registration.status === "waitlisted") {
    return {
      tone: "warn",
      title: "You are on the waiting list",
      body: "Every place is taken at the moment. If one opens we will email you straight away — there is nothing else you need to do.",
    };
  }
  if (registration.status === "confirmed") {
    return {
      tone: "ok",
      title: "Your place is confirmed",
      body: registration.event.format === "in_person"
        ? "We look forward to seeing you. Your confirmation email has the details."
        : "Your confirmation email has the joining link and the details.",
    };
  }
  return null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-12 font-semibold uppercase tracking-[.06em] text-muted">{label}</dt>
      <dd className="mt-1 text-15 text-ink">{children}</dd>
    </div>
  );
}

export default async function EventRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isRegistrationToken(token)) notFound();

  let registration: EventRegistration | null = null;

  try {
    registration = (await eventApi.registration(token)).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    // Anything else — the API down, a throttle — is said on the page below.
  }

  if (!registration) {
    return (
      <>
        <PageHero section="company" kicker="Events" title="Your registration" crumbs={[{ name: "Events", path: "/events" }]} />
        <div className="section-y">
          <Container>
            <div className="max-w-2xl">
              <Alert tone="warn" title="We could not load your registration just now" dismissible={false}>
                Open the link in your confirmation email again in a moment. Nothing has changed, and nothing else is needed.
              </Alert>
            </div>
          </Container>
        </div>
      </>
    );
  }

  const { event } = registration;
  const step = nextStep(registration);
  // A place that is held and still to come: the only state with a date worth putting in a diary.
  const held = !event.is_past && registration.status === "confirmed";

  return (
    <>
      <PageHero
        section="company"
        kicker="Your registration"
        title={event.title}
        crumbs={[{ name: "Events", path: "/events" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid max-w-3xl gap-6">
            {step && <Alert tone={step.tone} title={step.title} dismissible={false}>{step.body}</Alert>}

            <Card as="section" interactive={false}>
              <h2 className="sr-only">Registration details</h2>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Row label="Status"><Badge tone={TONE[registration.status] ?? "closed"}>{registration.status_label}</Badge></Row>
                <Row label="Booked for">
                  {registration.name}
                  {registration.seats > 1 && <span className="text-muted"> · {registration.seats} seats</span>}
                </Row>
                <Row label="Date">{event.date_label}</Row>
                <Row label="Time">{event.time_label}</Row>
                <Row label="Format">{event.format_label}</Row>
                {(event.venue_name || event.venue_address) && (
                  <Row label="Where">
                    {event.venue_name && <span className="block font-medium">{event.venue_name}</span>}
                    {event.venue_address && <span className="block whitespace-pre-line text-muted">{event.venue_address}</span>}
                  </Row>
                )}
              </dl>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
                <ButtonLink href={`/events/${event.slug}`} variant="secondary" size="sm">See the event page</ButtonLink>
                {held && <AddToCalendar slug={event.slug} />}
              </div>
            </Card>

            {registration.can_cancel && (
              <RegistrationManage
                seats={registration.seats}
                cancelAction={cancelEventRegistrationAction.bind(null, token)}
              />
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
