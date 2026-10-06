import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { IconMapPin } from "@/components/icons-ui";
import { GlyphCalendar, GlyphClock, GlyphExternal, GlyphPeople, GlyphScreen } from "@/components/events/glyphs";
import { eventPlace } from "@/components/events/event-tiles";
import { focalStyle } from "@/lib/focal";
import { hueFor } from "@/lib/hues";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { EventAgendaItem, EventDetail, EventSpeaker } from "@/types/events";

/**
 * The pieces of an event's own page: the facts at a glance, the agenda, the
 * speakers and the venue. Server components, all of them — nothing here
 * needs a browser, and the page they sit on is served from the ISR cache.
 *
 * Every word about *when* is the API's (`date_label`, `time_label`), written
 * in the site's timezone; the only thing read off `starts_at` is the
 * `dateTime` attribute a machine wants.
 */

/**
 * The event at a glance: the facts somebody decides on before reading the
 * description. The vacancy page's strip, with an event's four facts.
 *
 * A grid rather than a wrapping row, so the count decides the columns and a
 * row never ends on one fact alone: three facts (an online event has no
 * place) stand three across from `sm`; four go two by two until there is
 * room for all four. On a phone each takes a line, because "Thursday 12
 * November 2026" beside anything else at 320px is a column of single words.
 */
export function EventGlance({ event }: { event: EventDetail }) {
  const place = eventPlace(event);
  const items: { icon: ReactNode; label: string; value: ReactNode }[] = [
    { icon: <GlyphCalendar />, label: "Date", value: <time dateTime={event.starts_at}>{event.date_label}</time> },
    { icon: <GlyphClock />, label: "Time", value: event.time_label },
    { icon: event.format === "online" ? <GlyphScreen /> : <GlyphPeople />, label: "Format", value: event.format_label },
    ...(place ? [{ icon: <IconMapPin />, label: "Where", value: place }] : []),
  ];

  return (
    <ul className={cn("grid gap-x-8 gap-y-4", items.length === 4 ? "min-[480px]:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
      {items.map((item) => (
        <li key={item.label} className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-brand-ink/30 text-brand-ink [&_svg]:size-4">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-11-5 font-semibold uppercase tracking-[.08em] text-muted">{item.label}</span>
            <span className="block text-14-5 font-medium text-ink">{item.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The agenda as a timeline: a rail down the page, a dot per item, the time
 * to its left and what happens to its right.
 *
 * From `sm` the time has a column of its own, right-aligned against the
 * rail, so the eye runs down the times and across to the titles. On a phone
 * that column would take a third of the screen for seven characters, so the
 * time moves above its title and the rail hugs the left edge. An agenda
 * nobody gave times to drops the column at every width rather than holding
 * it empty.
 *
 * `time` is whatever the editor typed — "3:00 pm", "After lunch" — and is
 * shown as typed; nothing here parses it. It is set in the mono face because
 * it is a figure in a column, which is what that face is for.
 */
export function EventAgenda({ items }: { items: EventAgendaItem[] }) {
  if (items.length === 0) return null;

  const timed = items.some((item) => item.time?.trim());

  return (
    <section aria-labelledby="event-agenda">
      <h2 id="event-agenda" className="display-3">Agenda</h2>
      <ol className="mt-6">
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <li
              key={`${index}-${item.title}`}
              className={cn(
                "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4",
                timed && "sm:grid-cols-[7rem_1.25rem_minmax(0,1fr)]",
              )}
            >
              {timed && (
                <p className="col-start-2 row-start-1 font-mono text-13 leading-6 text-brand-ink sm:col-start-1 sm:text-right">
                  {item.time?.trim()}
                </p>
              )}

              {/* The rail: a dot on the item's first line, and the line on to the next one. */}
              <span
                aria-hidden
                className={cn("relative col-start-1 row-start-1 flex justify-center", timed ? "row-span-2 sm:col-start-2 sm:row-span-1" : "")}
              >
                <span className="mt-[7px] size-2.5 shrink-0 rounded-full bg-brand-600 ring-4 ring-brand-500/15" />
                {!last && <span className="absolute top-6 bottom-0 w-px bg-line-strong" />}
              </span>

              <div className={cn("col-start-2 min-w-0", timed && "row-start-2 sm:col-start-3 sm:row-start-1", last ? "pb-0" : "pb-7")}>
                <h3 className="text-15-5 leading-6 font-semibold text-ink">{item.title}</h3>
                {item.note && <p className="mt-1 text-14-5 leading-[1.6] whitespace-pre-line text-muted">{item.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The speakers, as a row of cards: a round photograph, a name and what they
 * do. When there is no photograph the disc holds the person's initials on a
 * wash of their own hue — `hueFor()` on the name, the team card's rule, and
 * for the same reason the hue stays off the words: the neon set is graded
 * for a glyph on a surface, not for text.
 *
 * A row card rather than a portrait card, because an event has one speaker
 * as often as it has six, and one portrait card in a row of three empty
 * tracks is exactly the orphan this page is not allowed to have. The list is
 * one column beside the registration panel and two when there is room, and
 * the rule in `globals.css` (`[data-event-speakers]`) stretches the last
 * card across when the count is odd — which a row card can do without
 * looking stretched.
 */
export function EventSpeakers({ speakers }: { speakers: EventSpeaker[] }) {
  if (speakers.length === 0) return null;

  return (
    <section aria-labelledby="event-speakers">
      <h2 id="event-speakers" className="display-3">{speakers.length === 1 ? "Speaker" : "Speakers"}</h2>
      <ul data-event-speakers className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {speakers.map((speaker, index) => (
          <li
            key={`${index}-${speaker.name}`}
            data-card
            className="flex min-w-0 items-center gap-4 rounded-lg border border-line-strong bg-card p-4"
            style={{ "--speaker-hue": hueFor(speaker.name) } as CSSProperties}
          >
            <span className="relative block size-16 shrink-0 overflow-hidden rounded-full border-2 border-[color-mix(in_srgb,var(--speaker-hue)_45%,transparent)] bg-surface-2">
              {speaker.photo ? (
                <Image
                  src={speaker.photo}
                  alt={speaker.photo_alt ?? ""}
                  fill
                  sizes="64px"
                  className="object-cover"
                  style={focalStyle(speaker.photo_focus)}
                />
              ) : (
                <span
                  aria-hidden
                  className="grid size-full place-items-center bg-[color-mix(in_srgb,var(--speaker-hue)_12%,var(--color-surface-2))] font-display text-19 font-semibold text-ink"
                >
                  {initials(speaker.name)}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <h3 className="text-15-5 leading-snug font-semibold text-ink [overflow-wrap:anywhere]">{speaker.name}</h3>
              {speaker.role && <p className="mt-0.5 text-13-5 leading-[1.5] text-muted">{speaker.role}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Where the event is held, for an event with a room: the venue, its address
 * as the editor broke its lines, and a way to open it in a map.
 *
 * The map is a link and not an embed — an embedded map is 430KB of somebody
 * else's script and a set of cookies before anybody has agreed to anything
 * (`components/contact/map-embed.tsx`), and what a person on their way to an
 * event wants is the map *application*, which a link opens. `map_url` is held
 * to http(s) by the API; it is checked again here because it becomes an
 * `href`. Nothing renders for an online event, which has no venue to name.
 */
export function EventVenue({ event }: { event: EventDetail }) {
  if (!event.venue_name && !event.venue_address) return null;

  const map = event.map_url && /^https?:\/\//i.test(event.map_url) ? event.map_url : null;

  return (
    <section aria-labelledby="event-venue">
      <h2 id="event-venue" className="display-3">Where</h2>
      <div data-card className="mt-6 flex flex-col gap-5 rounded-lg border border-line-strong bg-card p-5 sm:flex-row sm:items-center">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-ink/30 text-brand-ink">
          <IconMapPin className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {event.venue_name && <p className="text-15-5 font-semibold text-ink">{event.venue_name}</p>}
          {event.venue_address && (
            <address className="mt-1 text-14-5 leading-[1.6] whitespace-pre-line text-muted not-italic">{event.venue_address}</address>
          )}
          {!event.venue_address && event.venue_city && <p className="mt-1 text-14-5 text-muted">{event.venue_city}</p>}
        </div>
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-13-5 font-semibold text-ink transition-colors duration-(--duration-base) hover:border-brand-ink hover:text-brand-ink"
          >
            Open in Maps
            <GlyphExternal className="size-4 shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </section>
  );
}
