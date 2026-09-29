import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdentityIcon, iconMap } from "@/components/icons";
import { IconArrowRight } from "@/components/icons-ui";
import { MarqueeToggle } from "@/components/company/marquee-toggle";
import { getSiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { ContentBlock, StackContent, StackGroup, StackItem } from "@/types/blocks";
import { StackOrbit } from "./stack-orbit";
import { StackGlobe } from "./stack-globe";
import type { OrbitNode, OrbitRing } from "./stack-types";
import { brandName } from "@/lib/brand";

type StackBlockData = Extract<ContentBlock, { type: "stack" }>;

const LAYOUTS = new Set(["orbit", "grouped", "cloud", "globe", "marquee", "layers"]);

/** The orbit draws at most three rings; a fourth group onwards rides the outer one. */
const MAX_RINGS = 3;

/**
 * A "technology stack" content block — the logos and icons of what the
 * business works with, grouped, in one of six layouts (`block.layout`,
 * `App\Enums\StackLayout`; anything unknown draws `grouped`).
 *
 * A server component. The two layouts that move by script — the orbit's
 * picking and the globe — are client islands handed already-rendered
 * elements, so the identity icon map never reaches the browser (CLAUDE.md,
 * "Bundles"); the other four are markup and CSS.
 *
 * Every layout keeps the technologies readable without its motion: the
 * orbit carries a visually hidden list of every one, the globe's nodes are
 * real labelled text in reading order, the marquee's first copy is the real
 * one and every repeat is `inert`, and
 * everything that moves by itself has a Pause button, stops on hover and
 * focus, and is still under reduced motion.
 */
export function StackBlock({ block, embedded = false }: { block: StackBlockData; embedded?: boolean }) {
  const content = block.content;
  const groups = (content.groups ?? [])
    .map((g) => ({ ...g, items: (g.items ?? []).filter((i) => i && i.label) }))
    .filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;

  const layout = LAYOUTS.has(block.layout) ? block.layout : "grouped";

  const body =
    layout === "orbit" ? <OrbitLayout block={block} groups={groups} />
    : layout === "cloud" ? <CloudLayout block={block} groups={groups} />
    : layout === "globe" ? <GlobeLayout groups={groups} label="the technology globe" />
    : layout === "marquee" ? <MarqueeLayout groups={groups} />
    : layout === "layers" ? <LayersLayout groups={groups} />
    : <GroupedLayout groups={groups} />;

  const inner = (
    <>
      <StackHeader content={content} />
      {body}
    </>
  );

  if (embedded) return <div className="stack-block my-10" data-layout={layout}>{inner}</div>;
  return (
    <section className="stack-block section-y" data-layout={layout}>
      <Container>{inner}</Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared parts                                                        */
/* ------------------------------------------------------------------ */

/**
 * Kicker, heading and lede — `SectionHeader`'s shape, which cannot be used
 * as is because a stack block's heading is optional. Without one the block
 * still owns an `h2`, visually hidden, so the group and card titles below
 * (`h3`) never jump a level under the page's own heading.
 */
function StackHeader({ content }: { content: StackContent }) {
  const visible = Boolean(content.kicker || content.heading || content.lede);
  return (
    <div className={cn(visible && "mb-10")}>
      {content.kicker && (
        <span className="text-12 font-semibold uppercase tracking-[.13em] text-secondary-ink">{content.kicker}</span>
      )}
      {content.heading
        ? <h2 className="display-2 mt-3.5 text-balance">{content.heading}</h2>
        : <h2 className="sr-only">Technology stack</h2>}
      {content.lede && <p className="lede mt-4">{content.lede}</p>}
    </div>
  );
}

/** A colour the API sent, only if it is a plain hex — it becomes a CSS custom property, never text. */
function cleanColour(c: string | null | undefined): string | null {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
}

/** Up to two letters for a technology with neither a picture nor an icon. */
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).toUpperCase();
}

/**
 * A technology's mark on its disc: the picture (a media file or a brand's
 * own logo) on the logo ground, which stays light in the dark scheme so a
 * logo's real colours read; else its identity icon in its own hue; else its
 * initials. The picture's `alt` is empty because the label is always beside
 * it or names the control holding it.
 */
function StackDisc({ item, sizes, className }: { item: StackItem; sizes: string; className?: string }) {
  if (item.image) {
    return (
      <span className={cn("stack-disc stack-disc--logo", className)} aria-hidden="true">
        <span className="stack-disc__mark">
          <Image src={item.image} alt="" fill sizes={sizes} className="object-contain" />
        </span>
      </span>
    );
  }
  if (item.icon && item.icon in iconMap) {
    return (
      <span className={cn("stack-disc stack-disc--icon", className)} aria-hidden="true">
        <IdentityIcon name={item.icon} className="stack-disc__mark" />
      </span>
    );
  }
  return (
    <span className={cn("stack-disc stack-disc--icon", className)} aria-hidden="true">
      <span className="font-display text-[length:max(12px,0.8em)] font-semibold leading-none text-muted">{initials(item.label)}</span>
    </span>
  );
}

/** Wraps `children` in a link when the technology has one. */
function MaybeLink({ href, className, children }: { href?: string | null; className?: string; children: ReactNode }) {
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <span className={className}>{children}</span>;
}

/** Every technology once, for a screen reader, where the layout's own markup is moving or positional. */
function HiddenList({ groups }: { groups: StackGroup[] }) {
  return (
    <ul className="sr-only">
      {groups.flatMap((g, gi) => g.items.map((item, i) => (
        <li key={`${gi}-${i}`}>
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
          {item.type ? ` — ${item.type}` : ""}
          {g.name ? ` (${g.name})` : ""}
        </li>
      )))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Orbit                                                               */
/* ------------------------------------------------------------------ */

function OrbitLayout({ block, groups }: { block: StackBlockData; groups: StackGroup[] }) {
  const ringGroups = groups.slice(0, MAX_RINGS).map((g, i) =>
    i === MAX_RINGS - 1 ? { ...g, items: groups.slice(MAX_RINGS - 1).flatMap((x) => x.items) } : g,
  );

  const items: StackItem[] = [];
  const rings: OrbitRing[] = ringGroups.map((g) => {
    const start = items.length;
    items.push(...g.items);
    return {
      speed: g.speed_seconds && g.speed_seconds > 0 ? g.speed_seconds : 60,
      direction: g.direction === "ccw" ? "ccw" : "cw",
      nodes: g.items.map((_, k) => start + k),
    };
  });

  const nodes: OrbitNode[] = items.map((item, i) => ({ key: `${block.id}-${i}`, label: item.label, colour: cleanColour(item.colour) }));
  const marks = items.map((item, i) => <StackDisc key={i} item={item} sizes="44px" className="size-full" />);
  const details = items.map((item, i) => <StackDetail key={i} item={item} />);

  return (
    <>
      <HiddenList groups={groups} />
      <StackOrbit
        rings={rings}
        nodes={nodes}
        marks={marks}
        details={details}
        centre={<StackCentre center={block.content.center ?? null} />}
        pauseControl={<MarqueeToggle label="the technology orbit" />}
      />
    </>
  );
}

/**
 * The middle disc: the block's own centre picture, else the site's logo,
 * else the company name. Async only for the fallback — the settings read is
 * the one the layout has already made, deduplicated by Next.
 */
async function StackCentre({ center }: { center: StackContent["center"] }) {
  if (center?.image) {
    return (
      <span className="relative block size-full">
        <Image src={center.image} alt={center.image_alt ?? ""} fill sizes="140px" className="object-contain" />
      </span>
    );
  }
  const settings = await getSiteSettings();
  const name = settings.company_name || brandName();
  if (settings.logo_url) {
    return (
      <span className="relative block size-full">
        <Image src={settings.logo_url} alt={name} fill sizes="140px" className="object-contain" />
      </span>
    );
  }
  return (
    <span className="stack-logo-ink block text-center font-display text-[length:clamp(12px,3.4cqw,17px)] font-semibold leading-tight [overflow-wrap:anywhere]">
      {name}
    </span>
  );
}

/** What the orbit shows beside the stage for the picked technology. */
function StackDetail({ item }: { item: StackItem }) {
  const colour = cleanColour(item.colour);
  return (
    <Card
      interactive={false}
      padding="md"
      className="stack-detail"
      style={colour ? ({ "--stack-accent": colour } as CSSProperties) : undefined}
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <StackDisc item={item} sizes="56px" className="size-14" />
        <div className="min-w-0 flex-1">
          <h3 className="text-17 font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{item.label}</h3>
          {item.type && <p className="mt-0.5 text-13 text-muted">{item.type}</p>}
        </div>
        {item.badge && <Badge tone="accent" dot={false}>{item.badge}</Badge>}
      </div>
      {item.description && <p className="mt-4 text-14-5 leading-relaxed text-muted">{item.description}</p>}
      {item.href && (
        <Link href={item.href} className="mt-4 inline-flex min-h-6 items-center gap-1.5 text-14 font-semibold text-brand-ink hover:underline">
          Learn more<span className="sr-only"> about {item.label}</span>
          <IconArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Grouped                                                             */
/* ------------------------------------------------------------------ */

function GroupedLayout({ groups }: { groups: StackGroup[] }) {
  return (
    <div className="space-y-10">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.name && <h3 className="mb-4 text-17 font-semibold text-ink">{g.name}</h3>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {g.items.map((item, i) => {
              const inside = (
                <>
                  <StackDisc item={item} sizes="44px" className="size-11" />
                  <span className="mt-3 block text-14 font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{item.label}</span>
                  {item.type && <span className="mt-0.5 block text-12-5 text-muted">{item.type}</span>}
                  {item.badge && <Badge tone="accent" dot={false} className="mt-2.5">{item.badge}</Badge>}
                </>
              );
              return (
                <li key={i} className="min-w-0">
                  {item.href
                    ? <Card href={item.href} padding="sm" className="h-full">{inside}</Card>
                    : <Card interactive={false} padding="sm" className="h-full">{inside}</Card>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cloud                                                               */
/* ------------------------------------------------------------------ */

/** Five fixed type steps, weight 1 to 5 — the smallest is the public site's 14px body floor. */
const CLOUD_SIZES = ["text-14", "text-[16px]", "text-19", "text-[23px]", "text-[28px]"] as const;

/** FNV-1a — a stable seed from the block, so the cloud's order is the same on every render. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, seeded, and the same sequence in every JavaScript engine. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function CloudLayout({ block, groups }: { block: StackBlockData; groups: StackGroup[] }) {
  const items = groups.flatMap((g) => g.items);
  const rand = seeded(hash(`${block.id}:${items.map((i) => i.label).join("|")}`));
  const order = items.map((item, i) => ({ item, i }));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3.5">
      {order.map(({ item, i }) => {
        const weight = Math.min(5, Math.max(1, Math.round(item.weight ?? 3)));
        return (
          <li key={i} className="min-w-0 max-w-full">
            <MaybeLink
              href={item.href}
              className={cn(
                "stack-cloud__item inline-flex max-w-full items-center gap-[.45em] rounded-full border border-line-strong bg-card py-[.3em] pl-[.35em] pr-[.8em] font-semibold leading-tight text-ink",
                "transition-[translate,border-color] duration-(--duration-base) ease-brand hover:-translate-y-1 hover:border-brand-300",
                CLOUD_SIZES[weight - 1],
              )}
            >
              <StackDisc item={item} sizes="40px" className="size-[1.4em] min-h-6 min-w-6" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
            </MaybeLink>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Globe                                                               */
/* ------------------------------------------------------------------ */

function GlobeLayout({ groups, label }: { groups: StackGroup[]; label: string }) {
  const items = groups.flatMap((g) => g.items);
  const nodes = items.map((item, i) => (
    <MaybeLink key={i} href={item.href} className="flex flex-col items-center">
      <StackDisc item={item} sizes="40px" className="size-10" />
      <span className="mt-1 max-w-[9rem] truncate text-12 font-semibold text-ink">{item.label}</span>
    </MaybeLink>
  ));
  // No hidden list here: each node's label is real text, in reading order,
  // wherever the sphere happens to have turned it.
  return <StackGlobe nodes={nodes} label={label} />;
}

/* ------------------------------------------------------------------ */
/* Marquee                                                             */
/* ------------------------------------------------------------------ */

/** Pills per copy: past the widest screen, so the second copy never shows a gap before it. */
const MIN_PER_COPY = 12;

/**
 * One row per group, alternate rows running the other way. `LogoMarquee`
 * is not reused because it takes neither a direction nor a label per logo
 * and brings its own Container and rule; this is its markup pattern, kept
 * faithfully: the track is two copies sliding `-50%` (`.brand-marquee-track`
 * in globals.css), the gap is a margin **on the item** so each copy is
 * self-contained, only an item's first appearance is real and every repeat
 * is `inert`, and `MarqueeToggle` stops the row for a keyboard. The fade
 * mask sits on an inner wrapper so it cannot fade the toggle.
 */
function MarqueeLayout({ groups }: { groups: StackGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => {
        const copy: StackItem[] = [];
        while (copy.length < MIN_PER_COPY) copy.push(...g.items);
        const track = [...copy, ...copy];
        return (
          <div key={gi}>
            {g.name && <h3 className="mb-3 text-center text-13 font-semibold uppercase tracking-[.13em] text-muted">{g.name}</h3>}
            <div data-marquee className="brand-marquee relative pb-9">
              <div className="brand-marquee-fade overflow-hidden">
                <ul
                  className="brand-marquee-track flex w-max items-center py-1"
                  style={{ animationDuration: `${copy.length * 3}s`, animationDirection: gi % 2 ? "reverse" : undefined }}
                >
                  {track.map((item, i) => {
                    const real = i < g.items.length;
                    return (
                      <li key={i} className="mr-3 shrink-0" inert={!real} aria-hidden={real ? undefined : true}>
                        <MaybeLink
                          href={item.href}
                          className="flex items-center gap-2.5 rounded-full border border-line-strong bg-card py-1.5 pl-1.5 pr-4 transition-colors duration-(--duration-base) hover:border-brand-300"
                        >
                          <StackDisc item={item} sizes="32px" className="size-8" />
                          <span className="whitespace-nowrap text-14 font-semibold text-ink">{item.label}</span>
                        </MaybeLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <MarqueeToggle label={g.name ? `the ${g.name} row` : "the technology row"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

/**
 * The groups as a stack of plates, tilted back on the `rotate` property from
 * `md` (`.stack-layers` in blocks.css), each overlapping the one above it;
 * one lifts on hover on the `translate` property. Below `md` they are flat
 * cards stacked with a gap — a tilted plate at 320px is a squashed one.
 */
function LayersLayout({ groups }: { groups: StackGroup[] }) {
  return (
    <ol className="stack-layers mx-auto max-w-5xl">
      {groups.map((g, gi) => (
        <li key={gi} className="stack-layers__item" style={{ "--layer": gi } as CSSProperties}>
          <Card interactive={false} padding="md" className="stack-layer">
            <div className="mb-3.5 flex items-baseline gap-3">
              <span className="font-mono text-12 text-muted">{String(gi + 1).padStart(2, "0")}</span>
              <h3 className="text-17 font-semibold text-ink">{g.name || `Layer ${gi + 1}`}</h3>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {g.items.map((item, i) => (
                <li key={i} className="min-w-0 max-w-full">
                  <MaybeLink
                    href={item.href}
                    className="flex max-w-full items-center gap-2 rounded-full border border-line-strong bg-surface py-1 pl-1 pr-3.5"
                  >
                    <StackDisc item={item} sizes="28px" className="size-7" />
                    <span className="min-w-0 text-13 font-semibold text-ink [overflow-wrap:anywhere]">{item.label}</span>
                  </MaybeLink>
                </li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ol>
  );
}
