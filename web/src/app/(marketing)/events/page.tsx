import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { EventTiles } from "@/components/events/event-tiles";
import { PAST_EVENTS, UPCOMING_EVENTS } from "@/components/events/data";
import { publicApi } from "@/lib/api";
import { isPrerendering } from "@/lib/build-phase";
import { brandName } from "@/lib/brand";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import type { EventSummary } from "@/types/events";

/*
 * ISR, and it reads no `searchParams` — which is what keeps it in the route
 * cache. There is no `?page=` here on purpose: the upcoming list is whatever
 * is coming up (fifty is the API's ceiling and far beyond a real calendar),
 * and the past list is the latest six, said as such. Two minutes, the
 * vacancies' window: an event leaves "upcoming" because the clock moved,
 * not because anybody saved anything.
 */
export const revalidate = 120;

export const metadata = buildMetadata({
  title: "Events",
  description: `Seminars, webinars and product demonstrations from ${brandName()} — what is coming up, and how to reserve a place.`,
  path: "/events",
});

export default async function EventsIndex() {
  let upcoming: EventSummary[] = [];
  let past: EventSummary[] = [];
  let failed = false;

  try {
    // Together: neither list waits for the other. The past list is the lesser
    // of the two, so on its own it fails quietly rather than taking the page.
    [upcoming, past] = await Promise.all([
      publicApi.events(UPCOMING_EVENTS).then((r) => r.data),
      publicApi.events(PAST_EVENTS).then((r) => r.data).catch(() => [] as EventSummary[]),
    ]);
  } catch (error) {
    // A build that cannot reach the API fails rather than baking this panel
    // into static HTML (`lib/build-phase.ts`).
    if (isPrerendering) throw error;
    failed = true;
  }

  return (
    <>
      <PageHero
        section="company"
        kicker="Events"
        title="Seminars, demonstrations and webinars"
        lede="Sessions run by the engineers who do the work — in person and online. See what is coming up and reserve a place."
      />

      <section className="section-y" aria-labelledby={upcoming.length > 0 ? "events-upcoming" : undefined}>
        <Container data-aos="fade-up">
          {failed ? (
            <ErrorState title="We could not load the events">
              Something is wrong at our end. Try again shortly, or get in touch and we will tell you what is coming up.
            </ErrorState>
          ) : upcoming.length === 0 ? (
            /*
              An honest empty calendar, with the one thing somebody who came
              looking for an event can still do. No "Upcoming events" heading
              above it: the panel's own line is the section's heading, and a
              heading over a heading says the same nothing twice.
            */
            <EmptyState
              illustration="calendar"
              title="Nothing on the calendar right now"
              action={<ButtonLink href="/contact?subject=Events" variant="secondary">Ask us about a session</ButtonLink>}
            >
              We announce each seminar and demonstration here as soon as its date is fixed.
              {past.length > 0 ? " What we have run recently is below." : " If there is a subject you would like us to cover, tell us."}
            </EmptyState>
          ) : (
            <>
              <h2 id="events-upcoming" className="display-3">Upcoming events</h2>
              <p className="measure mt-2 text-14-5 leading-[1.6] text-muted">
                {upcoming.length === 1 ? "One date is fixed so far." : "Soonest first."} Open one for the agenda, the speakers and a place.
              </p>
              <EventTiles events={upcoming} className="mt-7" />
            </>
          )}
        </Container>
      </section>

      {past.length > 0 && (
        <section className="border-t border-line bg-surface section-y" aria-labelledby="events-past">
          <Container data-aos="fade-up">
            <h2 id="events-past" className="display-3">Past events</h2>
            <p className="measure mt-2 text-14-5 leading-[1.6] text-muted">
              {past.length === 1 ? "The most recent one we ran." : `The last ${past.length === 6 ? "six" : past.length} we ran.`}
            </p>
            <EventTiles events={past} tone="past" className="mt-7" />
          </Container>
        </section>
      )}

      {/*
        `ItemList` of what is coming up. Each event emits its own `Event`
        graph on its own page, which is what a search engine reads for the
        date and the place; this is the index saying those pages exist.
      */}
      {upcoming.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: upcoming.map((event, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${siteUrl()}/events/${event.slug}`,
              name: event.title,
            })),
          }}
        />
      )}

      <CtaBand />
    </>
  );
}
