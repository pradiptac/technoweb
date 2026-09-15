import type { CSSProperties } from "react";
import { MarqueeToggle } from "@/components/company/marquee-toggle";
import { AnnouncementClose, AnnouncementShell } from "@/components/layout/announcement-client";
import { Container } from "@/components/ui/container";
import type { Announcement } from "@/lib/announcement";
import { cn } from "@/lib/utils";

/**
 * The strip above the header: one line of the client's own words, on a
 * colour (or two) they chose, fixed or scrolling.
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
        className="announcement-bar relative text-13-5 leading-snug"
        style={style}
      >
        {a.mode === "ticker" ? <Ticker a={a} /> : (
          <Container className={cn("flex min-h-9 items-center justify-center py-1.5 text-center", a.closable && "pr-9")}>
            <Message html={a.html} />
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

function Ticker({ a }: { a: Announcement }) {
  const chars = Math.max(1, a.html.replace(/<[^>]+>/g, "").length);
  const repeats = Math.max(1, Math.ceil(MIN_CHARS_PER_COPY / chars));
  // ~4.5 characters a second reads comfortably; bounded so a two-word
  // message does not flash past and a paragraph does not crawl.
  const duration = Math.min(90, Math.max(20, Math.round((chars * repeats) / 4.5)));
  const items = Array.from({ length: repeats * 2 }, (_, i) => i);

  return (
    <div data-marquee className={cn("brand-marquee announcement-ticker relative min-h-9 py-1.5", a.closable ? "pr-20" : "pr-11")}>
      {/* The fade mask sits on this wrapper, not the host: on the host it
          would fade the pause button and the × sitting in its right edge. */}
      <div className="brand-marquee-fade overflow-hidden">
        <div className="brand-marquee-track flex w-max items-center" style={{ animationDuration: `${duration}s` }}>
          {items.map((i) => (
            <Message key={i} html={a.html} hidden={i > 0} className="mr-12 shrink-0 whitespace-nowrap" />
          ))}
        </div>
      </div>
      <MarqueeToggle
        label="the announcement"
        className={cn("bottom-1/2 translate-y-1/2 border-current bg-transparent opacity-70 hover:opacity-100 focus-visible:opacity-100", a.closable ? "right-11" : "right-2")}
      />
    </div>
  );
}
