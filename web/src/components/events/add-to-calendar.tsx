import { cn } from "@/lib/utils";
import { GlyphCalendar } from "@/components/events/glyphs";
import { calendarHref } from "@/components/events/data";

/**
 * "Add to calendar": the event as an `.ics`, from the route handler at
 * `/api/events/{slug}/calendar`.
 *
 * **A plain `<a download>`, never a `next/link`.** A `Link` at a route
 * handler prefetches it (`CLAUDE.md`, the subscriber export): every visitor
 * who merely scrolled past this would have had the calendar file built and
 * thrown away. It is also why this cannot be a `ButtonLink` — so the
 * `button` look below is the secondary button's own classes, written out,
 * with `btn` so a chosen button motion style still reaches it.
 *
 * No directive: the event page draws it on the server and the registration
 * panel draws it on the client.
 */
export function AddToCalendar({
  slug, look = "link", className,
}: {
  slug: string;
  /** `button` beside the hero's Register button; `link` inside a panel. */
  look?: "button" | "link";
  className?: string;
}) {
  return (
    <a
      href={calendarHref(slug)}
      download
      className={cn(
        look === "button"
          ? "btn inline-flex cursor-pointer items-center justify-center gap-2 rounded border border-line-strong bg-card px-[22px] py-[13px] text-15 font-semibold whitespace-nowrap text-ink shadow-1 transition-all duration-(--duration-base) ease-brand hover:border-secondary-400 hover:text-secondary-ink"
          : "inline-flex min-h-6 items-center gap-1.5 text-13-5 font-semibold text-brand-ink underline-offset-2 hover:underline",
        className,
      )}
    >
      <GlyphCalendar className="size-4 shrink-0" />
      Add to calendar
    </a>
  );
}
