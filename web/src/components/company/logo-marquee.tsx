import Image from "next/image";
import { Container } from "@/components/ui/container";
import { MarqueeToggle } from "@/components/company/marquee-toggle";
import { cn } from "@/lib/utils";

export type MarqueeLogo = { id: number; name: string; logo: string | null; /** A line for the flip tile's back — the client's industry. */ detail?: string | null };

/** Slots per copy — 18 × 200px is past any desktop, so a copy always fills the screen. */
const MIN_PER_COPY = 18;

/**
 * A strip of logos scrolling past — the homepage's partner brands, and now
 * the clients under "trusted by". One component, because two copies of the
 * loop arithmetic below is two chances to reintroduce the 20px snap.
 *
 * ## The loop
 *
 * The track holds two copies of the list and slides `translateX(-50%)`
 * before looping, so identical copies make the loop point invisible — true
 * only if `-50%` of the track is *exactly* the distance from one copy's
 * first logo to the next copy's first logo. Flex `gap` breaks that: N items
 * produce N−1 gaps, so half an odd count of gaps is not a whole number and
 * the track snapped forward by one missing gap every loop. `mr-10` on every
 * item — the last of each copy included — makes each copy self-contained,
 * so two copies sum to exactly double. Verified frame by frame, and the CSS
 * lives in `globals.css` under `.brand-marquee-*`.
 *
 * ## The logos
 *
 * `fill`, not `width`/`height`: there are no per-logo dimensions on the wire,
 * and a guessed pair declares an aspect ratio the file almost never matches,
 * which Next logs as a console warning the audit fails on. `brand-logo` is
 * the dark-scheme silhouette filter — a logo's real colours only read on a
 * light ground.
 *
 * The `sr-only` list is the accessible version; the moving track is
 * `aria-hidden`, because a marquee read aloud is the same names twice,
 * moving.
 */
/** Slot sizes. `md` is the vendor strip; `lg` the client wall, where the logo is the point. */
const SLOT = {
  md: "h-14 w-40",
  lg: "h-20 w-56",
} as const;

export function LogoMarquee({
  items, caption, size = "md", variant = "logos", className,
}: {
  items: MarqueeLogo[];
  caption?: string;
  size?: keyof typeof SLOT;
  /**
   * `logos` is the plain strip — a mark every 224px, which is what a row of
   * manufacturer logos wants. `tiles` is for the client wall: each client is
   * a compact bordered pill with a small mark and its **name**, coloured
   * under the pointer. The name is the point. Client "logos" here are
   * placeholder cards until the real artwork lands, and a row of large blank
   * green rectangles 400px apart read as a broken image strip; a tile with
   * the name beside a small mark reads as a client list whatever the mark
   * is, and it stays right when a real logo replaces it. `flip` is the
   * client wall as it ships: a 200×200 tile showing the whole mark, which
   * turns over under the pointer (or keyboard focus, through the strip's
   * `focus-within` pause) to the client's name and industry on a brand
   * face. The logo is visible the entire time it is not being asked about —
   * the ask was "the logo should be visible" — and the name arrives only
   * when somebody looks. The 3D turn is `.flip-tile` in globals.css.
   */
  variant?: "logos" | "tiles" | "flip";
  className?: string;
}) {
  if (items.length === 0) return null;

  /*
    One *copy* is the list repeated until it is wider than any screen, and
    the track is two copies. `-50%` is seamless only when a copy is at least
    as wide as the viewport: six clients at 192px a slot is 1,152px, so on a
    1440 screen the second copy sat beside the first and the loop showed the
    gap after it. Repeating within the copy keeps every item's own trailing
    margin, so the copy is still self-contained and two still sum to exactly
    double. The duration scales with the copy, or a longer track sprints.
  */
  const copy: MarqueeLogo[] = [];
  while (copy.length < MIN_PER_COPY) copy.push(...items);

  return (
    <div data-aos="fade-up" className={cn("border-b border-line pt-5 pb-9.5", className)}>
      <Container>
        {caption && (
          <p className="mb-6.5 text-center text-xs font-semibold uppercase tracking-[.13em] text-muted">
            {caption}
          </p>
        )}

        <ul className="sr-only">
          {items.map((item) => <li key={item.id}>{item.name}</li>)}
        </ul>

        {/*
          `data-marquee` is what the toggle finds and flips `data-paused` on.
          Hover and focus-within already pause the strip, but the visual track
          is `aria-hidden` and nothing in it takes focus, so a keyboard had no
          way to stop it — and moving content that starts by itself has to be
          stoppable by everyone, not by whoever has a pointer.
        */}
        <div data-marquee className="brand-marquee brand-marquee-fade relative overflow-hidden">
          <ul
            aria-hidden="true"
            className="brand-marquee-track flex w-max items-center"
            // Tiles are ~180px against a 224px logo slot, so the same
            // per-item pace would read faster; 2s a tile keeps the speed.
            style={{ animationDuration: `${copy.length * (variant === "tiles" ? 2 : variant === "flip" ? 2.2 : 2.5)}s` }}
          >
            {[...copy, ...copy].map((item, i) => (
              variant === "flip" ? (
                <li key={`${item.id}-${i}`} className="flip-tile mr-4 size-[200px] shrink-0">
                  <div className="flip-tile__inner relative size-full">
                    <div className="flip-tile__face absolute inset-0 grid place-items-center overflow-hidden rounded-xl border border-line-strong bg-card p-6">
                      {item.logo ? (
                        <span className="relative size-full">
                          <Image src={item.logo} alt="" fill sizes="200px" className="brand-logo object-contain" />
                        </span>
                      ) : (
                        <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-faint">{item.name}</span>
                      )}
                    </div>
                    <div className="flip-tile__face flip-tile__back absolute inset-0 grid place-items-center rounded-xl bg-brand-600 p-5 text-center text-brand-on">
                      <span>
                        <span className="block font-display text-[17px] font-semibold leading-tight">{item.name}</span>
                        {item.detail && <span className="mt-1.5 block text-[12.5px] opacity-90">{item.detail}</span>}
                      </span>
                    </div>
                  </div>
                </li>
              ) : variant === "tiles" ? (
                <li
                  key={`${item.id}-${i}`}
                  className="mr-3 flex shrink-0 items-center gap-3 rounded-full border border-line-strong bg-card py-2 pl-2.5 pr-5 transition-colors duration-(--duration-base) hover:border-brand-300"
                >
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
                    {item.logo ? (
                      <Image src={item.logo} alt="" fill sizes="32px" className="brand-logo object-cover" />
                    ) : (
                      <span className="grid h-full place-items-center font-display text-[13px] font-semibold text-muted">
                        {item.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-[14px] font-medium text-ink">{item.name}</span>
                </li>
              ) : (
              <li key={`${item.id}-${i}`} className={cn("relative mr-10 flex shrink-0 items-center justify-center", SLOT[size])}>
                {item.logo ? (
                  <Image src={item.logo} alt="" fill sizes="224px" className="brand-logo object-contain" />
                ) : (
                  <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-faint">
                    {item.name}
                  </span>
                )}
              </li>
              )
            ))}
          </ul>
          <MarqueeToggle />
        </div>
      </Container>
    </div>
  );
}
