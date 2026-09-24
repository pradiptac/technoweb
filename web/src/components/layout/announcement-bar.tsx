import type { CSSProperties } from "react";
import { MarqueeToggle } from "@/components/company/marquee-toggle";
import { AnnouncementClose, AnnouncementShell } from "@/components/layout/announcement-client";
import { AnnouncementRotator } from "@/components/layout/announcement-rotator";
import { Container } from "@/components/ui/container";
import type { Announcement } from "@/lib/announcement";
import { cn } from "@/lib/utils";

/**
 * The strip above the header: one line of the client's own words, on a
 * colour (or two) they chose: fixed, scrolling, or one line at a time.
 *
 * A server component with two client islands — the shell that hides a
 * closed bar and the × that closes it — so the markup, the colours and the
 * ticker's copies all arrive rendered. Everything about its colours was
 * decided in `announcementFor()`: the stops as they paint and one ink that
 * clears AA on every one of them, so the inline `style` here is the only
 * place a hex reaches the DOM and the audit grades what the derivation
 * already guaranteed (a gradient is graded on its worst stop; both stops
 * are opaque). The band does not invert with the scheme — it is a designed
 * band, like the CTA card — which is why nothing in it uses a `text-*`
 * token: the message inherits the band's ink and every element in it says
 * `text-inherit`.
 *
 * The message is rendered with `dangerouslySetInnerHTML` from a value the
 * API cleaned through its `inline` purifier profile (emphasis and links,
 * no style, no blocks) — never `Prose`, whose ink tokens would paint the
 * page's colours onto a band they were not derived for.
 *
 * The ticker is the partner strip's marquee, reused verbatim: the same
 * `.brand-marquee*` classes, a track of two copies with the gap as a margin
 * on the item so `-50%` lands on the second copy's start, the message
 * repeated until a copy is wider than any screen, and the same three ways
 * to pause (hover, focus inside, the toggle). Only the first item is real
 * — every repeat is `aria-hidden` and `inert`, so a screen reader hears
 * the message once and a link in it is one tab stop, not eight; focusing
 * that link pauses the track through `focus-within`. Under reduced motion
 * the global rule freezes the track, and `globals.css` turns the frozen
 * strip into a centred, unmasked line with the repeats hidden.
 */
export function AnnouncementBar({ announcement, preview = false }: { announcement: Announcement; preview?: boolean }) {
  const a = announcement;

  /*
   * The message as one line, for the two styles that are one line.
   *
   * A `<br>` breaks a line even under `white-space: nowrap`, so a message an
   * editor wrote as three lines drew a 33px fixed bar and a 24px vertical one
   * — three styles, three heights, on a strip whose whole job is to be the
   * same thin line above the header (the client, 2026-09-23). The lines are
   * already split for the vertical style, so joining them is the same one
   * definition read the other way; the separator is a middot because a space
   * runs two sentences together and the ticker already spaces its repeats.
   */
  const oneLine = a.lines.join(" &middot; ");
  const style: CSSProperties = {
    backgroundColor: a.stops[0],
    backgroundImage: a.stops.length > 1 ? `linear-gradient(90deg, ${a.stops[0]}, ${a.stops[1]})` : undefined,
    color: a.ink,
  };

  return (
    <AnnouncementShell id={a.id} preview={preview}>
      <div
        role="region"
        aria-label="Announcement"
        data-announcement={a.id}
        data-mode={a.mode}
        className="announcement-bar relative text-12 leading-snug sm:text-13-5"
        style={style}
      >
        {a.mode === "ticker" ? <Ticker a={a} html={oneLine} /> : a.mode === "vertical" ? (
          /*
            One line at a time, rising. The stack is decoration — it is
            `aria-hidden` inside the rotator — so the whole message is rendered
            once beside it for anything that reads rather than looks. A live
            region would interrupt somebody every few seconds; a rotator whose
            only readable line is the current one loses the rest.
          */
          <Container className={cn("flex min-h-6 items-center py-0 sm:min-h-[27px] sm:py-0.5", a.closable && "pr-9")}>
            <AnnouncementRotator lines={a.lines} className="w-full" />
            <Message html={a.html} className="sr-only" />
          </Container>
        ) : (
          <Container className={cn("flex min-h-6 items-center justify-center py-0 text-center sm:min-h-[27px] sm:py-0.5", a.closable && "pr-9")}>
            {/*
              One line, ellipsised (the client, 2026-09-23). The band is a slim
              24/27px strip now, and a fixed message long enough to wrap took it
              to 66px on a phone — three styles, three different heights, on a
              bar whose whole job is to be the same thin line above the header.
              A message too long to fit on one line is what the ticker and the
              one-line-at-a-time style exist for, and the console says so under
              the choice.
            */}
            <Message html={oneLine} className="min-w-0 truncate" />
          </Container>
        )}
        {a.closable && <AnnouncementClose id={a.id} preview={preview} />}
      </div>
    </AnnouncementShell>
  );
}

/**
 * The message, styled for a one-line band. Paragraphs run inline (the
 * editor wraps everything in one); links are underlined in the band's own
 * ink, which is what makes them visible on a colour nobody chose for links.
 */
function Message({ html, className, hidden = false }: { html: string; className?: string; hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      // `inert` so a repeated link is never a tab stop. React 19 renders the
      // boolean attribute as written.
      inert={hidden || undefined}
      className={cn(
        "[&_p]:inline [&_p+p]:ml-3 [&_a]:font-semibold [&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-2",
        "[&_a:hover]:opacity-80 [&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic",
        "[&_u]:underline [&_s]:line-through [&_sub]:align-sub [&_sub]:text-[0.8em] [&_sup]:align-super [&_sup]:text-[0.8em]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** A copy is the message repeated until it is longer than any screen is wide. */
const MIN_CHARS_PER_COPY = 240;

function Ticker({ a, html }: { a: Announcement; html: string }) {
  const chars = Math.max(1, html.replace(/<[^>]+>/g, "").length);
  const repeats = Math.max(1, Math.ceil(MIN_CHARS_PER_COPY / chars));
  // ~4.5 characters a second reads comfortably; bounded so a two-word
  // message does not flash past and a paragraph does not crawl.
  const duration = Math.min(90, Math.max(20, Math.round((chars * repeats) / 4.5)));
  const items = Array.from({ length: repeats * 2 }, (_, i) => i);

  return (
    <div data-marquee className={cn("brand-marquee announcement-ticker relative min-h-6 py-0 sm:min-h-[27px] sm:py-0.5", a.closable ? "pr-[4.25rem]" : "pr-10")}>
      {/* The fade mask sits on this wrapper, not the host: on the host it
          would fade the pause button and the × sitting in its right edge. */}
      <div className="brand-marquee-fade overflow-hidden">
        <div className="brand-marquee-track flex w-max items-center" style={{ animationDuration: `${duration}s` }}>
          {items.map((i) => (
            <Message key={i} html={html} hidden={i > 0} className="mr-12 shrink-0 whitespace-nowrap" />
          ))}
        </div>
      </div>
      <MarqueeToggle
        label="the announcement"
        className={cn("bottom-1/2 size-6 translate-y-1/2 border-current bg-transparent opacity-70 hover:opacity-100 focus-visible:opacity-100", a.closable ? "right-9" : "right-2")}
      />
    </div>
  );
}
