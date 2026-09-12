import Image from "next/image";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

export type MarqueeLogo = { id: number; name: string; logo: string | null };

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
export function LogoMarquee({
  items, caption, className,
}: {
  items: MarqueeLogo[];
  caption?: string;
  className?: string;
}) {
  if (items.length === 0) return null;

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

        <div className="brand-marquee brand-marquee-fade overflow-hidden">
          <ul aria-hidden="true" className="brand-marquee-track flex w-max items-center">
            {[...items, ...items].map((item, i) => (
              <li key={`${item.id}-${i}`} className="relative mr-10 flex h-10 w-28 shrink-0 items-center justify-center">
                {item.logo ? (
                  <Image src={item.logo} alt="" fill unoptimized className="brand-logo object-contain" />
                ) : (
                  <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-faint">
                    {item.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </div>
  );
}
