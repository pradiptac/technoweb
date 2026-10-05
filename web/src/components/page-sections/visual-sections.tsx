import type { CSSProperties, ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { CountUp } from "@/components/ui/count-up";
import { IconTile } from "@/components/ui/icon-tile";
import { IconCheck } from "@/components/icons-ui";
import { Ring } from "@/components/ui/ring";
import { ThemeBand } from "@/components/ui/theme-band";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type {
  ChecklistSectionData, CtaSectionData, StatsSectionData, StepsSectionData, TabsSectionData,
} from "@/types/api";
import { SectionButtons, SectionFrame, SectionHead } from "./section-parts";
import { SectionTabs } from "./section-tabs";

/**
 * The five self-contained bands of 0.107.0 (`docs/page-builder.md`, "Figures,
 * steps, tabs, checklists and calls to action").
 *
 * **Proportion is decided here, not by the editor.** A grid never has more
 * columns than items (`columnsFor`), so three figures on a 1920px screen are
 * three wide cards rather than three cards and an empty fourth slot; lists
 * that are *read* — bars, vertical steps, a one-column checklist — keep a
 * reading measure (`max-w-3xl`) however wide the page, because a 1700px bar
 * or line of text is the "looks odd at this resolution" the client named.
 *
 * Rows of cards are centred (`rowItem`), so a short last row sits in the
 * middle rather than leaving a hole at the end.
 *
 * Motion arrives with the section: the bars grow, the rings sweep and the
 * steps' line draws when the reveal observer stamps `data-aos-animate`
 * (`[data-meter-*]`/`[data-step-line]` in globals.css, `from`-only
 * keyframes inside the reduced-motion guard). A section set to appear with
 * "None" has no `data-aos` and simply shows its final state.
 */

type Reveal = { reveal?: SectionRevealAttr | null };

/** Columns for `n` items when the editor asked for `want`: never more than there are items. */
function columnsFor(n: number, want: number): string {
  const cols = Math.max(1, Math.min(n, want));
  return {
    1: "",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[cols] ?? "sm:grid-cols-2 lg:grid-cols-3";
}

/**
 * Widths for a row of cards that is **centred**, so a short last row sits in
 * the middle instead of leaving an empty slot at the end — five steps are
 * three and two, both centred, never three and two-and-a-hole. Two up from a
 * phone when `phonePair` (a figure is small; two side by side is the right
 * proportion at 360), one up otherwise; never more columns than items.
 */
function rowItem(n: number, want: number, phonePair = false): string {
  const cols = Math.max(1, Math.min(n, want));
  // Literal class names, never assembled: Tailwind generates only what it can read in the source.
  const base = phonePair && n > 1 ? "w-[calc(50%-0.5rem)]" : "w-full";
  const sm = cols >= 2 ? "sm:w-[calc(50%-0.5rem)]" : "";
  const lg = cols === 3 ? "lg:w-[calc((100%-2rem)/3)]" : cols === 4 ? "lg:w-[calc((100%-3rem)/4)]" : "";
  return cn(base, sm, lg);
}

/** Stagger index for a list's arrival, as `--i`. */
const nth = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * A list that is **read** — bars, numbered steps — beside its heading from
 * laptop width: the heading on the left, held while the list scrolls, the
 * list on the right. Left in one column under a heading it would run to the
 * full 1700px of a wide screen, or leave half of it empty.
 */
function SplitHead({ kicker, heading, lede, children }: { kicker?: string; heading?: string; lede?: string; children: ReactNode }) {
  if (!kicker && !heading && !lede) return <div className="max-w-4xl">{children}</div>;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 xl:gap-24">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <SectionHead kicker={kicker} heading={heading} lede={lede} className="lg:mb-0" />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StatsSection({ data, reveal }: { data: StatsSectionData } & Reveal) {
  const items = data.items ?? [];
  if (!items.length) return null;

  if (data.display === "bars") {
    return (
      <SectionFrame type="stats" reveal={reveal}>
        <Container>
          <SplitHead kicker={data.kicker} heading={data.heading} lede={data.lede}>
            <ul className="grid gap-y-7">
              {items.map((item, i) => (
                <li key={i} className="min-w-0" style={nth(i)}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-15 font-semibold text-ink">{item.label}</span>
                    <CountUp value={item.value} className="font-display text-22 font-semibold tabular-nums text-brand-ink" />
                  </div>
                  <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line ring-inset" aria-hidden>
                    <div data-meter-fill className="h-full origin-left rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, item.percent ?? 0))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </SplitHead>
        </Container>
      </SectionFrame>
    );
  }

  const width = rowItem(items.length, data.columns ?? 4, true);

  return (
    <SectionFrame type="stats" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <ul className="flex flex-wrap justify-center gap-4">
          {items.map((item, i) => (
            <li
              key={i}
              data-card
              style={nth(i)}
              className={cn(width, "flex min-w-0 flex-col items-center rounded-xl border border-line-strong bg-card px-3 py-6 text-center sm:px-6 sm:py-8")}
            >
              {data.display === "rings" ? (
                <span data-meter-ring className="text-brand-ink">
                  <Ring value={item.percent ?? 0} size={108} strokeWidth={8} className="text-brand-ink" trackClassName="text-surface-2">
                    <CountUp value={item.value} className="font-display text-22 font-semibold tabular-nums text-ink" />
                  </Ring>
                </span>
              ) : (
                <>
                  {item.icon && <IconTile name={item.icon} className="mb-4" />}
                  <CountUp value={item.value} className="font-display text-[clamp(30px,3.4vw,48px)] font-semibold leading-none tabular-nums text-brand-ink" />
                </>
              )}
              <span className="mt-4 text-14 font-medium leading-snug text-ink-2 sm:text-15">{item.label}</span>
            </li>
          ))}
        </ul>
      </Container>
    </SectionFrame>
  );
}

export function StepsSection({ data, reveal }: { data: StepsSectionData } & Reveal) {
  const items = data.items ?? [];
  if (!items.length) return null;
  const titled = Boolean(data.heading);

  if (data.layout === "horizontal") {
    // Rows of at most four; five to eight steps make two rows, the shorter centred.
    const width = rowItem(items.length, items.length <= 4 ? items.length : Math.ceil(items.length / 2));
    return (
      <SectionFrame type="steps" reveal={reveal}>
        <Container>
          <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
          <ol className="flex flex-wrap justify-center gap-4">
            {items.map((item, i) => (
              <li key={i} data-card style={nth(i)} className={cn(width, "relative flex min-w-0 gap-4 overflow-hidden rounded-xl border border-line-strong bg-card p-5 pt-6 sm:block sm:p-6 sm:pt-7")}>
                <span data-meter-fill aria-hidden className="absolute inset-x-0 top-0 h-1 origin-left bg-brand-600" />
                {/* On a phone the number sits beside the words, so a one-line step is not a tall, empty card. */}
                <span className="sm:mb-4 sm:block"><StepNumber n={i + 1} icon={item.icon} /></span>
                <div className="min-w-0 pt-2 sm:pt-0">
                  <StepText title={item.title} body={item.body} titled={titled} />
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame type="steps" reveal={reveal}>
      <Container>
        <SplitHead kicker={data.kicker} heading={data.heading} lede={data.lede}>
          <ol className="relative">
            {/* The line joining the discs, drawn down as the section arrives. */}
            <span data-step-line aria-hidden className="absolute bottom-6 left-[21px] top-6 w-0.5 origin-top rounded bg-brand-ink/30" />
            {items.map((item, i) => (
              <li key={i} style={nth(i)} className="relative flex gap-5 pb-9 last:pb-0">
                <StepNumber n={i + 1} icon={item.icon} />
                <div className="min-w-0 pt-2">
                  <StepText title={item.title} body={item.body} titled={titled} />
                </div>
              </li>
            ))}
          </ol>
        </SplitHead>
      </Container>
    </SectionFrame>
  );
}

/** The step's disc: its number, or its icon with the number for a screen reader. */
function StepNumber({ n, icon }: { n: number; icon?: string }) {
  return (
    <span className="relative z-1 grid size-11 shrink-0 place-items-center rounded-full border-2 border-brand-ink/40 bg-card text-15 font-semibold tabular-nums text-brand-ink">
      {icon ? <><IconTile name={icon} size="sm" className="border-0 bg-transparent" /><span className="sr-only">Step {n}</span></> : n}
    </span>
  );
}

function StepText({ title, body, titled }: { title: string; body?: string; titled: boolean }) {
  return (
    <>
      {titled
        ? <h3 className="text-17 font-semibold leading-snug text-ink">{title}</h3>
        : <p className="text-17 font-semibold leading-snug text-ink">{title}</p>}
      {body && <p className="mt-2 text-14-5 leading-[1.6] text-muted">{body}</p>}
    </>
  );
}

export function TabsSection({ data, reveal, id }: { data: TabsSectionData; id: string } & Reveal) {
  const items = (data.items ?? []).filter((t) => t.label && t.body);
  if (items.length < 2) return null;

  return (
    <SectionFrame type="tabs" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <SectionTabs id={id} items={items} titled={Boolean(data.heading)} />
      </Container>
    </SectionFrame>
  );
}

export function ChecklistSection({ data, reveal }: { data: ChecklistSectionData } & Reveal) {
  const items = data.items ?? [];
  if (!items.length) return null;
  const cols = data.columns ?? 2;

  return (
    <SectionFrame type="checklist" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <ul className={cn("grid gap-x-10 gap-y-4", cols === 1 ? "max-w-3xl" : columnsFor(items.length, cols))}>
          {items.map((item, i) => (
            <li key={i} style={nth(i)} className="flex min-w-0 items-start gap-3.5">
              {item.icon
                ? <IconTile name={item.icon} size="sm" className="shrink-0" />
                : (
                    <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-brand-ink/30 text-brand-ink">
                      <IconCheck className="size-4" />
                    </span>
                  )}
              <span className="pt-0.5 text-15-5 leading-[1.55] text-ink-2">{item.text}</span>
            </li>
          ))}
        </ul>
        <SectionButtons primary={data.primary} secondary={data.secondary} />
      </Container>
    </SectionFrame>
  );
}

/**
 * A call to action in the theme's own closing-band style — the band every
 * public page ends on, with this section's words. With no second button,
 * `call` offers the site's telephone number the way the theme's band
 * always has; without it there is none.
 */
export async function CtaSection({ data }: { data: CtaSectionData }) {
  const secondary = data.secondary?.label && data.secondary?.href
    ? { label: data.secondary.label, href: data.secondary.href }
    : data.call ? undefined : null;

  return (
    <div data-page-section="cta">
      <ThemeBand
        title={data.heading}
        body={data.lede}
        kicker={data.kicker}
        primary={data.primary?.label && data.primary?.href ? data.primary : undefined}
        secondary={secondary}
        tone={data.tone ?? "accent"}
      />
    </div>
  );
}
