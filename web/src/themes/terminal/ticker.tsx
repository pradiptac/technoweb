import { MarqueeToggle } from "@/components/company/marquee-toggle";
import { Container } from "@/components/ui/container";
import { contact, heroStats } from "@/content/site";
import { statPairs, type SiteSettings } from "@/lib/site-settings";

/**
 * The status ticker under Terminal's header.
 *
 * A 32px strip in the mono face: the homepage statistics (Settings →
 * Homepage), the kicker and the telephone number, scrolling for as long
 * as the page is open — the "permanent marquee" the plan named for this
 * theme. It is the brand marquee's CSS (`.brand-marquee-*`, the gap on the
 * item, the second copy `inert` and `aria-hidden`) and its pause button,
 * so it pauses on hover, on focus and by the button, and under reduced
 * motion the global rule freezes the track and the `announcement-ticker`
 * rule wraps the first copy and drops the repeat — one mechanism, three
 * strips (the logos, the info bar, this).
 */
export function Ticker({ settings }: { settings: SiteSettings }) {
  const stats = statPairs(settings.hero_stats, heroStats);
  const items = [
    ...stats.map((s) => `${s.value} ${s.label.toLowerCase()}`),
    settings.hero_kicker ?? "Networking · Servers · Security · Surveillance",
    `tel ${settings.phone ?? contact.phone}`,
  ];
  const copy = items.map((text, i) => (
    <span key={i} className="mr-10 inline-flex items-center gap-2 whitespace-nowrap">
      <i aria-hidden className="size-1.5 bg-brand-500" />
      {text}
    </span>
  ));

  return (
    <div className="border-b border-line bg-surface font-mono text-12 text-ink-2">
      <Container>
        <div data-marquee className="brand-marquee announcement-ticker relative h-8 pr-9">
          <div className="brand-marquee-fade h-full overflow-hidden">
            <div className="brand-marquee-track flex h-full w-max items-center" style={{ animationDuration: `${items.length * 4}s` }}>
              <span className="flex items-center">{copy}</span>
              <span inert aria-hidden className="flex items-center">{copy}</span>
            </div>
          </div>
          <MarqueeToggle label="the status ticker" className="top-1/2 -translate-y-1/2 border-line bg-card text-muted hover:text-ink focus-visible:text-ink" />
        </div>
      </Container>
    </div>
  );
}
