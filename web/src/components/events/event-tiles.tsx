import Image from "next/image";
import type { ReactNode } from "react";
import { Collection, Tile } from "@/components/ui/collection";
import { IconMapPin } from "@/components/icons-ui";
import { GlyphCalendar, GlyphClock, GlyphPeople, GlyphScreen } from "@/components/events/glyphs";
import { hueFor } from "@/lib/hues";
import type { EventSummary } from "@/types/events";
import { blurProps } from "@/lib/blur";

/**
 * Events as a `Collection` of `Tile`s, so each of the twelve themes draws
 * them in its own idiom — Editorial as a ruled index, Datacenter as a rack,
 * Vantage as a mosaic — without a line here knowing which is active
 * (`components/ui/collection.tsx`).
 *
 * **What goes where.** The date is the kicker, in the API's own words. The
 * date badge sits in the tile's icon slot, the arrangement the homepage's
 * resources section already uses (`data-tile-date`, which every theme's
 * idiom knows how to draw); it is `aria-hidden`, because the kicker has just
 * said the same thing aloud. The time, the format and the place are the meta.
 * The cover is the media well — and when *some* events have a cover and
 * others do not, the ones without take a brand well with a calendar on it,
 * so a row is never a picture, a gap and a picture. When none has one the
 * wells are left out altogether: twelve identical gradients are not twelve
 * pictures.
 *
 * **Never a half-empty row.** A grid of three with four things in it ends on
 * one tile and two holes. So the count decides the shape, and the soonest
 * events take the room that is left over:
 *
 *     1          one tile across the row, picture beside the words
 *     2          a pair
 *     3, 6, 9    rows of three
 *     4, 7       the first across the row, then rows of three
 *     5, 8       the first two as a pair, then rows of three
 *
 * The component only says which tile is which (`data-event-row` on the item,
 * `data-event-grid` on the list); the spans and the side-by-side layout are
 * the events block at the end of `globals.css`, which leaves the two listing
 * themes to their own rows. `tail` marks the last tile when the rows of
 * three hold an odd number: between 640px and 1024px those rows are two
 * across, and it is the tile that would be left alone.
 *
 * Launch's bento counts from the other end — its first pictured tile is a
 * lead with two stacked beside it, so what is left over is at the *end* —
 * and gets two marks of its own for that (`data-event-end`,
 * `data-event-odd`). They are attributes no other theme's CSS reads.
 *
 * `past` is the quiet version — no picture, no badge, no closing link: the
 * date, what it was, and where.
 */

type Row = "lead" | "pair" | "tail" | undefined;

type Shape = {
  cols: 1 | 2 | 3;
  six: boolean;
  row: (index: number) => Row;
  /** Launch, from 1024px: the one or two tiles left over after its rows of three. */
  end: (index: number) => "one" | "two" | undefined;
  /** Launch, 640px to 1024px: the last tile, when two across would leave it alone. */
  odd: (index: number) => "" | undefined;
};

function shape(count: number, pictured: boolean): Shape {
  // Launch's tablet grid is two across, after a full-width lead when the
  // first tile has a picture — so the last tile is alone for an even count
  // with pictures and an odd count without.
  const alone = pictured ? count % 2 === 0 : count % 2 === 1;
  const odd: Shape["odd"] = (index) => (alone && index === count - 1 ? "" : undefined);
  const none = () => undefined;

  if (count === 1) return { cols: 1, six: false, row: () => "lead", end: none, odd };
  if (count === 2) return { cols: 2, six: false, row: () => "pair", end: none, odd };
  // Four text tiles read better two by two than as a headline over three.
  if (count === 4 && !pictured) return { cols: 2, six: false, row: none, end: none, odd };

  const head = count % 3;
  const tail = (count - head) % 2 === 1;

  return {
    cols: 3,
    six: head > 0,
    row: (index) => {
      if (index < head) return head === 1 ? "lead" : "pair";
      return tail && index === count - 1 ? "tail" : undefined;
    },
    end: (index) => (index >= count - head ? (head === 1 ? "one" : "two") : undefined),
    odd,
  };
}

/** "Technoware Experience Centre, Mumbai", or null for an event with no room. */
export function eventPlace(event: Pick<EventSummary, "venue_name" | "venue_city">): string | null {
  return [event.venue_name, event.venue_city].map((part) => part?.trim()).filter(Boolean).join(", ") || null;
}

const SIZES: Record<NonNullable<Row> | "tile", string> = {
  lead: "(min-width: 640px) 44vw, 100vw",
  pair: "(min-width: 1440px) 20vw, (min-width: 640px) 45vw, 100vw",
  tail: "(min-width: 1024px) 30vw, (min-width: 640px) 44vw, 100vw",
  tile: "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw",
};

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 [&_svg]:size-3.5" aria-hidden>{icon}</span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export function EventTiles({
  events, tone = "upcoming", titleAs = "h3", compact = false, className,
}: {
  events: EventSummary[];
  tone?: "upcoming" | "past";
  /** `h3` under a section's `h2`, which is every place these are drawn today. */
  titleAs?: "h2" | "h3";
  /** No pictures and less padding: the "other events" strip on an event's own page. */
  compact?: boolean;
  className?: string;
}) {
  if (events.length === 0) return null;

  const past = tone === "past";
  const pictured = !past && !compact && events.some((event) => event.cover_image);
  const { cols, six, row, end, odd } = shape(events.length, pictured);

  return (
    <Collection kind="events" cols={cols} className={className} data-event-grid={six ? "six" : undefined} data-event-tone={tone}>
      {events.map((event, index) => {
        const place = eventPlace(event);
        const kind = row(index);

        return (
          <Tile
            key={event.id}
            href={`/events/${event.slug}`}
            titleAs={titleAs}
            title={event.title}
            kicker={<time dateTime={event.starts_at}>{event.date_label}</time>}
            summary={past ? undefined : event.summary}
            hue={hueFor(event.slug)}
            padding={past || compact ? "sm" : "md"}
            beam={!past && event.is_featured}
            data-event-row={kind}
            data-event-end={end(index)}
            data-event-odd={odd(index)}
            icon={past ? undefined : (
              <span aria-hidden data-tile-date className="grid place-content-center rounded-lg bg-brand-50 px-3.5 py-2 text-center font-mono">
                <b className="block text-19 text-brand-ink">{event.day}</b>
                <span className="text-11 uppercase tracking-[.04em] text-brand-ink">{event.month}</span>
              </span>
            )}
            focus={event.cover_image_focus}
            media={pictured ? (
              event.cover_image ? (
                <Image {...blurProps(event.cover_image_blur)}
                  src={event.cover_image}
                  alt={event.cover_image_alt ?? ""}
                  fill
                  sizes={SIZES[kind ?? "tile"]}
                  // The first row is above the fold under every theme, and under one
                  // whose hero has no banner its cover is the LCP: eager, never
                  // `priority` — a preload would ride on every page linking here.
                  loading={index < 3 ? "eager" : undefined}
                  className="object-cover"
                />
              ) : (
                // A wash of the tile's own hue with a calendar on it — the icon
                // tile's recipe at the size of a picture. A glyph, not the date
                // in type: the hues are graded for a graphic on a surface.
                <span
                  data-tile-well
                  className="grid size-full place-items-center bg-[color-mix(in_srgb,var(--tile-hue,var(--color-brand-500))_12%,var(--color-surface-2))] text-[var(--tile-hue,var(--color-brand-ink))]"
                >
                  <GlyphCalendar className="size-12 opacity-70" />
                </span>
              )
            ) : undefined}
            meta={(
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {!past && <Fact icon={<GlyphClock />}>{event.time_label}</Fact>}
                <Fact icon={event.format === "online" ? <GlyphScreen /> : <GlyphPeople />}>{event.format_label}</Fact>
                {place && <Fact icon={<IconMapPin />}>{place}</Fact>}
              </span>
            )}
            cta={past ? undefined : event.registration_mode === "none" ? "See the details" : "Details and registration"}
          />
        );
      })}
    </Collection>
  );
}
