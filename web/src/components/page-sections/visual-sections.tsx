import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { Container } from "@/components/ui/container";
import { CountUp } from "@/components/ui/count-up";
import { IconTile } from "@/components/ui/icon-tile";
import { IconCheck, IconClose } from "@/components/icons-ui";
import { Ring } from "@/components/ui/ring";
import { ThemeBand } from "@/components/ui/theme-band";
import { focalStyle } from "@/lib/focal";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type {
  BeforeAfterSectionData, ChecklistSectionData, ComparisonSectionData, CtaSectionData, StatsSectionData,
  StepsSectionData, TabsSectionData, TestimonialsSectionData, TimelineSectionData,
} from "@/types/api";
import { BeforeAfter } from "./before-after";
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
 * keyframes inside the reduced-motion guard). Where the browser has scroll
 * timelines the steps' and the timeline's line is drawn by the scroll
 * instead (0.115.0), keeping pace with the step being read. A section set
 * to appear with "None" has no `data-aos` and simply shows its final state.
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

/*
 * The four of 0.109.0 (`docs/page-builder.md`, "Comparison, timeline, before
 * and after, testimonials"), on the same rules: the component decides the
 * proportion, a list that is read keeps a reading measure, and a short last
 * row is centred.
 */

/** A comparison cell: "yes" a tick, "no" a cross, blank a dash, anything else its words. */
function Cell({ value }: { value?: string | null }) {
  const v = (value ?? "").trim();
  const key = v.toLowerCase();
  if (["yes", "y", "✓", "✔", "true", "included"].includes(key)) {
    return (
      <span className="inline-grid size-7 place-items-center rounded-full bg-brand-600 text-brand-on">
        <IconCheck className="size-4" aria-hidden /><span className="sr-only">Included</span>
      </span>
    );
  }
  if (["no", "n", "✗", "✕", "x", "false", "-", "—"].includes(key)) {
    return (
      <span className="inline-grid size-7 place-items-center rounded-full border border-line-strong text-faint">
        <IconClose className="size-3.5" aria-hidden /><span className="sr-only">Not included</span>
      </span>
    );
  }
  if (!v) return <span className="text-faint"><span aria-hidden>–</span><span className="sr-only">Not stated</span></span>;
  return <span>{v}</span>;
}

/**
 * Plans across, features down, a real `<table>` with row and column headers so
 * a screen reader names both for every cell. Held to `max-w-5xl` — a
 * comparison stretched across 1700px is a row of islands nobody can read
 * across. **On a phone it is one card per plan** instead: three columns of
 * values beside a label column do not fit 330px, and a table that scrolls
 * sideways hides the plan people came to compare. The two are alternatives
 * by breakpoint (`hidden`), so a screen reader meets exactly one.
 */
export function ComparisonSection({ data, reveal }: { data: ComparisonSectionData } & Reveal) {
  const plans = data.plans ?? [];
  const rows = data.rows ?? [];
  if (plans.length < 2 || !rows.length) return null;
  const hl = typeof data.highlight === "number" && data.highlight < plans.length ? data.highlight : null;
  const tint = "bg-brand-ink/[.06]";

  return (
    <SectionFrame type="comparison" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} center />
        <ul className="grid gap-4 sm:hidden">
          {plans.map((plan, j) => (
            <li key={j} data-card className={cn("rounded-xl border bg-card p-5", j === hl ? "border-brand-600 ring-1 ring-brand-600" : "border-line-strong")}>
              {j === hl && (
                <span className="mb-2 inline-block rounded-full bg-brand-600 px-2.5 py-0.5 text-12 font-semibold text-brand-on">Recommended</span>
              )}
              <p className="font-display text-18 font-semibold leading-tight text-ink">{plan.name}</p>
              {plan.note && <p className="mt-1 text-13 font-medium text-muted">{plan.note}</p>}
              <dl className="mt-4 divide-y divide-line border-t border-line">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="min-w-0 text-14 text-ink-2">{row.label}</dt>
                    <dd className="shrink-0 text-right text-14 font-medium text-ink"><Cell value={row.cells?.[j]} /></dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <div
          data-card
          role="region"
          tabIndex={0}
          aria-label={data.heading || "Comparison"}
          className="relative mx-auto hidden max-w-5xl overflow-x-auto rounded-xl border border-line-strong bg-card sm:block"
        >
          <table className={cn("w-full border-collapse text-left", plans.length > 3 && "min-w-[600px]")}>
            <thead>
              <tr>
                <th scope="col" className="w-[36%] p-3.5 align-bottom sm:p-5"><span className="sr-only">Feature</span></th>
                {plans.map((plan, j) => (
                  <th key={j} scope="col" className={cn("p-3.5 text-center align-bottom sm:p-5", j === hl && tint)}>
                    {j === hl && (
                      <span className="mb-2 inline-block rounded-full bg-brand-600 px-2.5 py-0.5 text-11-5 font-semibold text-brand-on">Recommended</span>
                    )}
                    <span className="block font-display text-15 font-semibold leading-tight text-ink sm:text-17">{plan.name}</span>
                    {plan.note && <span className="mt-1 block text-12-5 font-medium text-muted sm:text-13">{plan.note}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  <th scope="row" className="p-3.5 text-14 font-medium leading-snug text-ink-2 sm:px-5 sm:text-14-5">{row.label}</th>
                  {plans.map((_, j) => (
                    <td key={j} className={cn("p-3.5 text-center text-13-5 leading-snug text-ink-2 sm:px-5 sm:text-14", j === hl && tint)}>
                      <Cell value={row.cells?.[j]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SectionButtons primary={data.primary} center />
      </Container>
    </SectionFrame>
  );
}

/**
 * Dated milestones on a line that draws down as the section arrives. On a
 * phone the line runs down the left with every milestone beside it; from
 * laptop width it runs down the middle and the milestones alternate sides,
 * so neither half of a wide screen is left empty. Held to `max-w-5xl`.
 */
export function TimelineSection({ data, reveal }: { data: TimelineSectionData } & Reveal) {
  const items = data.items ?? [];
  if (!items.length) return null;
  const titled = Boolean(data.heading);

  return (
    <SectionFrame type="timeline" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} center />
        <ol className="relative mx-auto max-w-5xl">
          <span data-step-line aria-hidden className="absolute bottom-2 left-[7px] top-2 w-0.5 origin-top rounded bg-brand-ink/30 lg:left-1/2 lg:-translate-x-1/2" />
          {items.map((item, i) => {
            const right = i % 2 === 1;
            return (
              <li key={i} style={nth(i)} className="relative pb-10 pl-9 last:pb-0 lg:grid lg:grid-cols-2 lg:gap-x-20 lg:pl-0">
                <span aria-hidden className="absolute left-0 top-1 z-1 size-4 rounded-full border-[3px] border-brand-600 bg-card lg:left-1/2 lg:-translate-x-1/2" />
                <div className={cn("min-w-0", right ? "lg:col-start-2" : "lg:text-right")}>
                  <span className="inline-block rounded-full border border-brand-ink/30 px-3 py-0.5 text-13 font-semibold tabular-nums text-brand-ink">{item.date}</span>
                  {titled
                    ? <h3 className="mt-3 text-17 font-semibold leading-snug text-ink">{item.title}</h3>
                    : <p className="mt-3 text-17 font-semibold leading-snug text-ink">{item.title}</p>}
                  {item.body && <p className="mt-2 text-14-5 leading-[1.6] text-muted">{item.body}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </Container>
    </SectionFrame>
  );
}

/** Two pictures and a divider, held to `max-w-5xl` so a 16:10 frame is never a wall at 1920. */
export function BeforeAfterSection({ data, reveal }: { data: BeforeAfterSectionData } & Reveal) {
  if (!data.before || !data.after) return null;

  return (
    <SectionFrame type="before_after" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} lede={data.lede} center />
        <figure className="mx-auto max-w-5xl">
          <BeforeAfter
            before={data.before}
            beforeAlt={data.before_alt ?? ""}
            beforeFocus={data.before_focus}
            beforeBlur={data.before_blur}
            after={data.after}
            afterAlt={data.after_alt ?? ""}
            afterFocus={data.after_focus}
            afterBlur={data.after_blur}
            beforeLabel={data.before_label || "Before"}
            afterLabel={data.after_label || "After"}
            start={data.start ?? 50}
          />
          {data.caption && <figcaption className="mt-3 text-center text-13-5 text-muted">{data.caption}</figcaption>}
        </figure>
      </Container>
    </SectionFrame>
  );
}

/**
 * Quotations as cards. Four are two by two rather than three and one; every
 * other count is rows of up to three, the last row centred. The words take
 * the card's height so the names line up along a row.
 */
export function TestimonialsSection({ data, reveal }: { data: TestimonialsSectionData } & Reveal) {
  const items = (data.items ?? []).filter((t) => t.quote && t.name);
  if (!items.length) return null;
  const width = rowItem(items.length, items.length === 4 ? 2 : 3);

  return (
    <SectionFrame type="testimonials" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} center />
        <ul className="flex flex-wrap justify-center gap-4">
          {items.map((item, i) => (
            <li key={i} style={nth(i)} className={cn(width, "flex min-w-0")}>
              <figure data-card className="flex w-full flex-col rounded-xl border border-line-strong bg-card p-6 sm:p-7">
                <svg viewBox="0 0 24 24" className="size-6 fill-brand-ink" aria-hidden>
                  <path d="M9.5 6C6.5 7.2 5 9.6 5 13v5h5v-5H7.6c.2-2 1.1-3.3 2.9-4.1L9.5 6zm9 0c-3 1.2-4.5 3.6-4.5 7v5h5v-5h-2.4c.2-2 1.1-3.3 2.9-4.1L18.5 6z" />
                </svg>
                <blockquote className="mt-3 flex-1 text-15-5 leading-[1.6] text-ink">
                  <p>{item.quote}</p>
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3.5 border-t border-line pt-5">
                  {item.photo ? (
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-surface-2">
                      <Image src={item.photo} alt={item.photo_alt ?? ""} fill sizes="44px" className="object-cover" style={focalStyle(item.photo_focus)} />
                    </span>
                  ) : (
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-15 font-semibold text-brand-on">
                      {item.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-14-5 font-semibold text-ink">{item.name}</span>
                    {item.role && <span className="block text-13 text-muted">{item.role}</span>}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </SectionFrame>
  );
}
