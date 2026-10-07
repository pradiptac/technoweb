import Image from "next/image";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { ShareLinks } from "@/components/ui/share-links";
import { IconArrowRight } from "@/components/icons-ui";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { EventAgenda, EventGlance, EventSpeakers, EventVenue } from "@/components/events/event-parts";
import { EventTiles } from "@/components/events/event-tiles";
import { RegistrationPanel } from "@/components/events/registration-panel";
import { UPCOMING_EVENTS, isEventSlug } from "@/components/events/data";
import { ApiError, publicApi } from "@/lib/api";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { noIndex } from "@/lib/no-index";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import type { EventDetail, EventSummary } from "@/types/events";

async function load(slug: string): Promise<EventDetail | null> {
  // A slug that cannot be one is not sent to the API at all (`isEventSlug`).
  if (!isEventSlug(slug)) return null;

  try {
    return (await publicApi.event(slug)).data;
  } catch (error) {
    // A draft or archived event 404s at the API, which is this page's answer too.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/*
 * Empty on purpose, and the export itself is the feature.
 *
 * In Next 16 a dynamic-segment route is entered into the ISR route cache only
 * when it exports `generateStaticParams`; without it the page is rendered on
 * every request whatever its fetches are cached as. Returning `[]` enumerates
 * nothing at build and lets each event render on its first request, to be
 * served from the cache until `events` or `event:<slug>` is purged or the
 * two-minute window on its fetches runs out.
 *
 * **What it costs**: a request-time API — `cookies()`, `headers()`,
 * `searchParams` — or a `no-store` fetch anywhere in this render is a 500
 * ("Page changed from static to dynamic at runtime"), not a fallback. That is
 * exactly why the two things on this page that are about one visitor are
 * *not* in this render: whether there is room is asked by the registration
 * panel after mount (`/api/events/{slug}/availability`), and who is signed
 * in is read by the Server Action when the form is submitted. Keep it so.
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await load(slug);

  if (!event) return buildMetadata({ title: "Event not found", path: `/events/${slug}`, seo: noIndex });

  return buildMetadata({
    title: event.title,
    // The date is in the description a search result shows: for an event it
    // is the first thing anybody reading the result wants.
    description: event.summary ?? `${event.date_label}, ${event.time_label}. ${event.format_label}.`,
    path: `/events/${event.slug}`,
    image: event.cover_image,
    seo: event.seo,
  });
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Independent reads, together. The list of what else is coming up is the
  // index's own query, so it is one cached answer shared by both pages — and
  // it degrades to nothing by itself.
  const [event, upcoming] = await Promise.all([
    load(slug),
    publicApi.events(UPCOMING_EVENTS).then((r) => r.data).catch(() => [] as EventSummary[]),
  ]);

  if (!event) notFound();

  const url = `${siteUrl()}/events/${event.slug}`;
  const faqs = event.faqs ?? [];
  const others = upcoming.filter((other) => other.slug !== event.slug).slice(0, 3);
  // What the cached event says. The panel asks for what is true this minute.
  const registers = !event.is_past && event.registration.mode === "open";

  return (
    <>
      <PageHero
        section="company"
        kicker={event.is_past ? "Past event" : "Event"}
        title={event.title}
        lede={event.summary}
        crumbs={[{ name: "Events", path: "/events" }, { name: event.title, path: `/events/${event.slug}` }]}
      >
        {/*
          The panel is beside the content from `lg` and under it on a phone,
          so the way to it is at the top of the page at every width. Nothing
          to press on an event that is over.
        */}
        {!event.is_past && (
          <div className="flex flex-wrap gap-3">
            {registers && (
              <ButtonLink href="#register">
                Reserve a place <IconArrowRight />
              </ButtonLink>
            )}
            <AddToCalendar slug={event.slug} look="button" />
          </div>
        )}
      </PageHero>

      {/* At a glance, under the hero — when, how and where, in the API's own words. */}
      <div className="border-b border-line bg-surface">
        <Container className="py-5">
          <EventGlance event={event} />
        </Container>
      </div>

      <Container className="section-y">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
          <div className="grid min-w-0 content-start gap-12">
            {event.cover_image && (
              /*
                The cover has no fixed-height well, so it carries the ratio a
                cover is uploaded at (the case-study rule) — the box is
                reserved before the bytes land. Eager, never `priority`: it is
                usually the largest paint, and a preload would ride on every
                page that links here.
              */
              <div className="relative aspect-[1200/630] overflow-hidden rounded-lg border border-line bg-surface-2">
                <Image
                  src={event.cover_image}
                  alt={event.cover_image_alt ?? ""}
                  fill
                  sizes="(min-width: 1024px) 60vw, 90vw"
                  loading="eager"
                  className="object-cover"
                  style={focalStyle(event.cover_image_focus)} {...blurProps(event.cover_image_blur)}
                />
              </div>
            )}

            {/*
              The description; or the summary standing in for one; or, for an
              event announced with a title and a date and nothing else, the
              date said as a sentence. The column is never empty — an empty
              column beside a registration form reads as a page that failed
              to load.
            */}
            {event.body
              ? <ProseWithShortcodes html={event.body} />
              : (
                <p className="text-base leading-[1.7] text-ink-2">
                  {event.summary ?? `${event.title} is on ${event.date_label}, ${event.time_label}.`}
                </p>
              )}

            <EventAgenda items={event.agenda} />
            <EventSpeakers speakers={event.speakers} />
            <EventVenue event={event} />

            {/* The API's `faq_schema`, below, is the page's one FAQPage; `FaqList` emits none. */}
            {faqs.length > 0 && <div><FaqList faqs={faqs} /></div>}
          </div>

          {/*
            The registration panel: beside the content and sticky from `lg`,
            in the flow under it on a phone, where a 380px form held to the
            top of a 640px screen would be the whole screen. The column is
            the width a form wants and no wider; the share row sits under the
            panel so the aside is never a box with a void below it.
          */}
          <aside id="register" className="grid scroll-mt-24 content-start gap-5 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-line-strong bg-surface p-6">
              <RegistrationPanel
                slug={event.slug}
                isPast={event.is_past}
                format={event.format}
                rules={event.registration}
              />
            </div>
            <ShareLinks url={url} title={event.title} label="Send this to someone" className="justify-center" />
          </aside>
        </div>
      </Container>

      {others.length > 0 && (
        <section className="border-t border-line bg-surface section-y" aria-labelledby="events-more">
          <Container data-aos="fade-up">
            <h2 id="events-more" className="display-3">{event.is_past ? "Coming up" : "Also coming up"}</h2>
            <EventTiles events={others} compact className="mt-7" />
            <p className="mt-7">
              <ButtonLink href="/events" variant="secondary">
                All events <IconArrowRight />
              </ButtonLink>
            </p>
          </Container>
        </section>
      )}

      <CtaBand />

      {event.schema && <JsonLd data={event.schema} />}
      {event.faq_schema && <JsonLd data={event.faq_schema} />}
    </>
  );
}
