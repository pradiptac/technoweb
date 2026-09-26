import type { CSSProperties, ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
import { StatFigure } from "@/components/ui/stat";
import { splitNumber } from "@/components/ui/count-up";
import { IdentityIcon, iconMap } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ContentBlock, StatItem, StatsContent } from "@/types/blocks";

type StatsBlockData = Extract<ContentBlock, { type: "stats" }>;

/**
 * A stat bar (content block `type: "stats"`), in one of seven layouts.
 *
 * Server-rendered throughout. The only motion that needs JavaScript is the
 * count-up, and that is `StatValue`'s, keyed on the `data-stat-animation`
 * its container carries — the homepage figures' own mechanism, so a block's
 * figures and the hero's cannot count two different ways. Everything else
 * (the pulse, the underline, the glow) is CSS in `blocks.css`, inside the
 * reduced-motion guard.
 *
 * `embedded` is the shortcode case: the block sits in an article's body
 * column, so it brings no section padding and no container of its own.
 */
export function StatsBlock({ block, embedded = false }: { block: StatsBlockData; embedded?: boolean }) {
  const c = block.content;
  const items = (c.items ?? []).filter((i) => i && i.value !== undefined && i.label !== undefined);
  if (items.length === 0) return null;

  switch (block.layout) {
    case "sparkline_cards":
      return (
        <Shell embedded={embedded}>
          <BlockHeader content={c} />
          <SparklineCards items={items} />
        </Shell>
      );
    case "rings":
      return (
        <Shell embedded={embedded}>
          <BlockHeader content={c} />
          <Rings items={items.slice(0, 3)} />
        </Shell>
      );
    case "count_up":
      return (
        <Shell embedded={embedded}>
          <BlockHeader content={c} />
          <FigureGrid items={items} animation="count" size="clamp(34px, 3vw + 16px, 48px)" />
        </Shell>
      );
    case "pulse_strip":
      return (
        <Shell embedded={embedded}>
          <BlockHeader content={c} />
          <PulseStrip items={items} />
        </Shell>
      );
    case "feature_cards":
      return (
        <Shell embedded={embedded}>
          <FeatureCards content={c} items={items} />
        </Shell>
      );
    case "chips":
      return (
        <Shell embedded={embedded} className="blk-chips">
          <Chips content={c} items={items} />
        </Shell>
      );
    case "row":
    default:
      return (
        <Shell embedded={embedded}>
          <BlockHeader content={c} />
          <FigureGrid items={items} animation="none" size="34px" bordered />
        </Shell>
      );
  }
}

/** A section with its container on a page; a plain spaced block inside an article body. */
function Shell({ embedded, className, children }: { embedded: boolean; className?: string; children: ReactNode }) {
  if (embedded) return <div className={cn("my-10", className)}>{children}</div>;
  return (
    <section className={cn("section-y", className)}>
      <Container>{children}</Container>
    </section>
  );
}

/** Kicker, heading and lede — the `SectionHeader` shape, with the emphasis line the block may carry. */
function BlockHeader({ content, center = false }: { content: StatsContent; center?: boolean }) {
  const { kicker, heading, heading_emphasis: emphasis, lede } = content;
  if (!kicker && !heading && !lede) return null;
  return (
    <div className={cn("mb-10", center && "text-center")}>
      {kicker && (
        <span className="text-12 font-semibold uppercase tracking-[.13em] text-secondary-ink">{kicker}</span>
      )}
      {heading && (
        <h2 className={cn("display-2 text-balance", kicker && "mt-3.5")}>
          {heading}
          {emphasis && <> <span className="text-brand-ink">{emphasis}</span></>}
        </h2>
      )}
      {lede && <p className={cn("lede mt-4", center && "mx-auto")}>{lede}</p>}
    </div>
  );
}

function iconKey(icon: string | null | undefined): string | undefined {
  return icon && icon in iconMap ? icon : undefined;
}

/**
 * The column classes for a row of figures: two across on a phone — the
 * figures are compact enough to pair — up to four (or six) on a desktop.
 * Written out because Tailwind emits only the classes it can see.
 */
function figureColumns(n: number): string {
  if (n <= 1) return "";
  if (n === 2) return "grid-cols-2";
  if (n === 3) return "grid-cols-2 sm:grid-cols-3";
  if (n === 5) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
  if (n === 6) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";
  return "grid-cols-2 lg:grid-cols-4";
}

/**
 * `row` and `count_up`: the homepage hero's figure strip. The container is a
 * `stat-figures` row, so `--stat-ink` resolves to the palette's brand ink per
 * ground, and `data-stat-animation` tells `StatValue` whether to count.
 */
function FigureGrid({
  items, animation, size, bordered = false,
}: { items: StatItem[]; animation: "none" | "count"; size: string; bordered?: boolean }) {
  return (
    <dl
      className={cn(
        "stat-figures grid gap-x-5 gap-y-7",
        figureColumns(items.length),
        bordered && "border-t border-line-strong pt-6.5",
      )}
      data-stat-animation={animation}
      style={{ "--stat-size": size } as CSSProperties}
    >
      {items.map((s, i) => (
        <div key={`${s.label}-${i}`} className="min-w-0">
          <dt className="sr-only">{s.label}</dt>
          <dd>
            <StatFigure stat={{ value: s.value, label: s.label, icon: iconKey(s.icon) }} />
            {s.description && <p className="mt-1.5 text-13 text-muted">{s.description}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "+12%" reads as a rise and "−3%" as a fall; anything else is neither. */
function deltaTone(delta: string): "up" | "down" | "flat" {
  const t = delta.trim();
  if (/^[-−–↓]/.test(t)) return "down";
  if (/^[+↑]/.test(t)) return "up";
  return "flat";
}

function DeltaChip({ delta }: { delta: string }) {
  const tone = deltaTone(delta);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-12 font-semibold tabular-nums",
        tone === "up" && "bg-ok-soft text-ok",
        tone === "down" && "bg-err-soft text-err",
        tone === "flat" && "bg-surface-2 text-muted",
      )}
    >
      {delta}
    </span>
  );
}

function trendSentence(series: number[]): string {
  const first = series[0];
  const last = series[series.length - 1];
  const direction = last > first ? "rising" : last < first ? "falling" : "level";
  return `Trend over ${series.length} periods: ${direction}, from ${first} to ${last}.`;
}

/** `sparkline_cards`: a card per figure with a CSS bar chart drawn from its series. */
function SparklineCards({ items }: { items: StatItem[] }) {
  const cols = items.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : "";
  return (
    <div className={cn("grid gap-4", cols)}>
      {items.map((s, i) => {
        const series = (s.series ?? []).filter((n) => Number.isFinite(n));
        const max = Math.max(0, ...series);
        const icon = iconKey(s.icon);
        return (
          <Card key={`${s.label}-${i}`} as="article" interactive={false} padding="md" className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              {icon && <IdentityIcon name={icon} className="size-5 shrink-0" />}
              <h3 className="min-w-0 text-14 font-semibold text-muted">{s.label}</h3>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-display text-[clamp(28px,2vw+16px,36px)] font-bold leading-none tracking-[-.03em] text-ink">{s.value}</span>
              {s.delta && <DeltaChip delta={s.delta} />}
            </div>
            {s.description && <p className="mt-2 text-13 text-muted">{s.description}</p>}
            {series.length > 1 && (
              <>
                <div className="mt-auto flex h-12 items-end gap-1 pt-4" aria-hidden="true">
                  {series.map((n, j) => (
                    <span
                      key={j}
                      className={cn("min-w-0 flex-1 rounded-t-[2px] bg-brand-600", j < series.length - 1 && "opacity-45")}
                      style={{ height: `${max > 0 ? Math.max(6, (n / max) * 100) : 6}%` }}
                    />
                  ))}
                </div>
                <p className="sr-only">{trendSentence(series)}</p>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const RING_INKS = ["text-brand-ink", "text-accent-ink", "text-secondary-ink"];

/** A ring's fill: `percent` when set, otherwise the figure itself when it is a percentage. */
function ringPercent(s: StatItem): number {
  if (typeof s.percent === "number") return s.percent;
  const parsed = splitNumber(s.value);
  return parsed && parsed.suffix.trim().startsWith("%") ? parsed.number : 0;
}

/** `rings`: three rings, each filled to its percentage, the figure in HTML over it. */
function Rings({ items }: { items: StatItem[] }) {
  return (
    <ul className={cn("grid gap-8", items.length === 3 ? "sm:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : "")}>
      {items.map((s, i) => (
        <li key={`${s.label}-${i}`} className="flex min-w-0 flex-col items-center text-center">
          <Ring value={ringPercent(s)} size={136} strokeWidth={9} className={RING_INKS[i % RING_INKS.length]}>
            <span className="font-display text-[28px] font-bold leading-none tracking-[-.03em] text-ink">{s.value}</span>
          </Ring>
          <h3 className="mt-4 text-15 font-semibold text-ink">{s.label}</h3>
          {s.description && <p className="mt-1.5 max-w-[34ch] text-13 text-muted">{s.description}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * `pulse_strip`: a strip of figures where the anomalous ones pulse. The
 * pulse is keyed on the reveal observer's `data-aos-animate` and runs a few
 * times on arrival, then rests on a static ring — infinite motion is for
 * loaders in this project, and an alarm that never stops is one people learn
 * to ignore. The hairlines are borders pulled out by a pixel and clipped by
 * the strip, so a wrapped row never draws a doubled edge.
 */
function PulseStrip({ items }: { items: StatItem[] }) {
  return (
    <div data-aos="fade-up" className="blk-pulse overflow-hidden rounded-lg border border-line-strong bg-card">
      <dl className="flex flex-wrap">
        {items.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            className="-ml-px -mt-px min-w-0 flex-1 basis-[9.5rem] border-l border-t border-line px-5 py-4"
          >
            <dt className="flex items-center gap-2 text-13 text-muted">
              <span className="blk-pulse-dot" data-anomaly={s.anomaly ? "" : undefined} aria-hidden="true" />
              <span className="min-w-0">{s.label}</span>
              {s.anomaly && <span className="sr-only">(needs attention)</span>}
            </dt>
            <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-display text-22 font-bold leading-tight tracking-[-.02em] text-ink">{s.value}</span>
              {s.anomaly && s.delta && <span className="text-13 font-semibold tabular-nums text-warn">{s.delta}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** `feature_cards`: a centred display heading over three cards of big figures. */
function FeatureCards({ content, items }: { content: StatsContent; items: StatItem[] }) {
  const { kicker, heading, heading_emphasis: emphasis, lede } = content;
  return (
    <>
      {(kicker || heading || lede) && (
        <div className="mb-12 text-center">
          {kicker && (
            <span className="text-12 font-semibold uppercase tracking-[.13em] text-secondary-ink">{kicker}</span>
          )}
          {heading && (
            <h2 className={cn("display-1 text-balance", kicker && "mt-3.5")}>
              {heading}
              {emphasis && <span className="blk-grad-text block">{emphasis}</span>}
            </h2>
          )}
          {lede && <p className="lede mx-auto mt-5 max-w-[60ch]">{lede}</p>}
        </div>
      )}
      <div className={cn("grid gap-5", items.length >= 3 ? "md:grid-cols-2 lg:grid-cols-3" : items.length === 2 ? "md:grid-cols-2" : "")}>
        {items.map((s, i) => {
          const icon = iconKey(s.icon);
          return (
            <Card key={`${s.label}-${i}`} as="article" interactive={false} className="blk-feature-card flex min-w-0 flex-col">
              {(s.badge || icon) && (
                <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-12 font-semibold text-ink">
                  {icon && <IdentityIcon name={icon} className="size-4 shrink-0" />}
                  {s.badge && <span className="min-w-0">{s.badge}</span>}
                </span>
              )}
              <span className="mt-6 block font-display text-[clamp(44px,3.2vw+24px,64px)] font-bold leading-none tracking-[-.04em] text-ink">
                {s.value}
              </span>
              <h3 className="mt-4 flex items-center gap-2.5 text-15 font-semibold text-ink">
                <span className="h-0.5 w-6 shrink-0 rounded-full bg-accent-600" aria-hidden="true" />
                <span className="min-w-0">{s.label}</span>
              </h3>
              {s.description && <p className="mt-2.5 text-14 text-muted">{s.description}</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/** `chips`: a centred heading whose emphasis is underlined on hover, a row of chips and the recognitions under it. */
function Chips({ content, items }: { content: StatsContent; items: StatItem[] }) {
  const { kicker, heading, heading_emphasis: emphasis, lede, recognitions } = content;
  const recs = (recognitions ?? []).filter((r) => r && r.name);
  return (
    <div className="text-center">
      {(kicker || heading || lede) && (
        <div className="mb-10">
          {kicker && (
            <span className="text-12 font-semibold uppercase tracking-[.13em] text-secondary-ink">{kicker}</span>
          )}
          {heading && (
            <h2 className={cn("display-2 text-balance", kicker && "mt-3.5")}>
              {heading}
              {emphasis && <> <span className="blk-underline">{emphasis}</span></>}
            </h2>
          )}
          {lede && <p className="lede mx-auto mt-4 max-w-[62ch]">{lede}</p>}
        </div>
      )}
      <ul className="flex flex-wrap justify-center gap-3">
        {items.map((s, i) => {
          const icon = iconKey(s.icon);
          return (
            <li
              key={`${s.label}-${i}`}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-line-strong bg-card px-4 py-2 text-14"
            >
              {icon && <IdentityIcon name={icon} className="size-[18px] shrink-0" />}
              <b className="font-bold text-ink">{s.value}</b>
              <span className="min-w-0 text-muted">{s.label}</span>
            </li>
          );
        })}
      </ul>
      {recs.length > 0 && (
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-y-3">
          {recs.map((r, i) => {
            const icon = iconKey(r.icon);
            return (
              <li
                key={`${r.name}-${i}`}
                className={cn("inline-flex items-center gap-2 px-5 text-14", i > 0 && "border-l border-line-strong")}
              >
                {icon && <IdentityIcon name={icon} className="size-[18px] shrink-0" />}
                <b className="font-bold text-ink">{r.score}</b>
                <span className="text-muted">{r.name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
