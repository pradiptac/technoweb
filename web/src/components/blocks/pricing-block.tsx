import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { IconCheck } from "@/components/icons-ui";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ContentBlock, PricingContent, PricingPlan, PricingSet } from "@/types/blocks";
import { PricingSwitch, type Period } from "./pricing-switch";

type PricingBlockData = Extract<ContentBlock, { type: "pricing" }>;

/**
 * A pricing table (content block `type: "pricing"`), in three layouts.
 *
 * Display only: every button is a link and nothing is bought here — the
 * store is the one part of the site that sells (the scope limit in
 * `CLAUDE.md`). Prices are paise and go through `formatPaise`, the store's
 * own formatter, and a plan's `price_label` ("Custom", "Free") wins over any
 * figure.
 *
 * The plans are rendered on the server; `PricingSwitch` is the island that
 * holds the chosen set and billing period. With the toggle on, each price is
 * rendered for both periods and `blocks.css` shows the chosen one, so the
 * switch re-renders nothing but an attribute.
 */
export function PricingBlock({ block, embedded = false }: { block: PricingBlockData; embedded?: boolean }) {
  const c = block.content;
  const sets = (c.sets ?? []).filter((s) => s && Array.isArray(s.plans) && s.plans.length > 0);
  if (sets.length === 0) return null;

  const toggle = !!c.billing?.enabled && sets.some((s) => s.plans.some((p) => p.price_yearly_paise != null));
  const panels = sets.map((set, i) => <Layout key={i} layout={block.layout} set={set} toggle={toggle} />);
  const billing = toggle
    ? {
        monthly: c.billing?.monthly_label || "Monthly",
        yearly: c.billing?.yearly_label || "Yearly",
        note: c.billing?.yearly_note ?? null,
      }
    : null;

  const body = (
    <>
      <BlockHeader content={c} />
      {sets.length > 1 || billing ? (
        <PricingSwitch labels={sets.map((s) => s.label)} billing={billing} panels={panels} />
      ) : (
        <div className="blk-pricing" data-billing="monthly">{panels[0]}</div>
      )}
    </>
  );

  if (embedded) return <div className="my-10">{body}</div>;
  return (
    <section className="section-y">
      <Container>{body}</Container>
    </section>
  );
}

function BlockHeader({ content }: { content: PricingContent }) {
  const { kicker, heading, lede } = content;
  if (!kicker && !heading && !lede) return null;
  return (
    <div className="mb-10 text-center">
      {kicker && (
        <span className="text-12 font-semibold uppercase tracking-[.13em] text-secondary-ink">{kicker}</span>
      )}
      {heading && <h2 className={cn("display-2 text-balance", kicker && "mt-3.5")}>{heading}</h2>}
      {lede && <p className="lede mx-auto mt-4 max-w-[62ch]">{lede}</p>}
    </div>
  );
}

function Layout({ layout, set, toggle }: { layout: string; set: PricingSet; toggle: boolean }) {
  if (layout === "comparison") return <Comparison set={set} toggle={toggle} />;
  if (layout === "single_focus") return <SingleFocus plan={set.plans[0]} toggle={toggle} />;
  return <ThreeTier plans={set.plans} toggle={toggle} />;
}

/* ------------------------------------------------------------------ prices */

type Shown = { amount: string; suffix: string | null } | null;

/**
 * What a plan shows for a period: that period's price, the other one when it
 * has none, and nothing at all when it has neither. The suffix is the plan's
 * own `period` wording where the plan has a single price, and says which
 * period where it has both — a yearly figure labelled "per month" is a
 * figure somebody writes down wrong.
 */
function pick(plan: PricingPlan, period: Period): Shown {
  const monthly = plan.price_monthly_paise ?? null;
  const yearly = plan.price_yearly_paise ?? null;
  const both = monthly !== null && yearly !== null;
  const source: Period | null =
    period === "yearly" ? (yearly !== null ? "yearly" : monthly !== null ? "monthly" : null)
      : (monthly !== null ? "monthly" : yearly !== null ? "yearly" : null);
  if (source === null) return null;
  const paise = source === "monthly" ? monthly! : yearly!;
  const fallback = source === "monthly" ? "per month" : "per year";
  return { amount: formatPaise(paise), suffix: both ? (source === "monthly" ? plan.period || fallback : fallback) : plan.period || fallback };
}

function PriceFace({ shown, size }: { shown: Shown; size: "md" | "lg" }) {
  const big = size === "lg" ? "text-[clamp(40px,3vw+24px,56px)]" : "text-[clamp(34px,2vw+22px,44px)]";
  if (!shown) return <span className={cn("font-display font-bold leading-none tracking-[-.03em] text-ink", big)}>On request</span>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      <span className={cn("font-display font-bold leading-none tracking-[-.03em] text-ink tabular-nums", big)}>{shown.amount}</span>
      {shown.suffix && <span className="text-14 text-muted">{shown.suffix}</span>}
    </span>
  );
}

/** The price for a plan, once per period when the toggle is on. */
function Price({ plan, toggle, size = "md" }: { plan: PricingPlan; toggle: boolean; size?: "md" | "lg" }) {
  if (plan.price_label) return <PriceFace shown={{ amount: plan.price_label, suffix: null }} size={size} />;
  if (!toggle) return <PriceFace shown={pick(plan, "monthly")} size={size} />;
  return (
    <>
      <span data-period="monthly"><PriceFace shown={pick(plan, "monthly")} size={size} /></span>
      <span data-period="yearly"><PriceFace shown={pick(plan, "yearly")} size={size} /></span>
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

function Features({ features, className }: { features: string[]; className?: string }) {
  if (features.length === 0) return null;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {features.map((f, i) => (
        <li key={`${f}-${i}`} className="flex gap-2.5 text-14 text-ink-2">
          <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden="true" />
          <span className="min-w-0">{f}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanCta({ plan, primary, className }: { plan: PricingPlan; primary: boolean; className?: string }) {
  const href = plan.cta?.href;
  if (!href) return null;
  return (
    <ButtonLink href={href} variant={primary ? "primary" : "secondary"} className={cn("w-full whitespace-normal text-center", className)}>
      {plan.cta?.label || "Get started"}
    </ButtonLink>
  );
}

function Badge({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-12 font-semibold",
        strong ? "bg-brand-600 text-brand-on" : "border border-line-strong bg-surface-2 text-ink",
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- layouts */

function tierColumns(n: number): string {
  if (n <= 1) return "max-w-md mx-auto";
  if (n === 2) return "md:grid-cols-2 max-w-4xl mx-auto";
  if (n === 3) return "md:grid-cols-2 lg:grid-cols-3";
  return "md:grid-cols-2 xl:grid-cols-4";
}

/**
 * `three_tier`: plans side by side. The highlighted plan is raised with the
 * `translate` property (Tailwind v4's translate utilities set it, not
 * `transform`) and carries the brand edge and the filled button; nothing
 * about it animates.
 */
function ThreeTier({ plans, toggle }: { plans: PricingPlan[]; toggle: boolean }) {
  return (
    <div className={cn("grid items-stretch gap-5 lg:pt-3", tierColumns(plans.length))}>
      {plans.map((plan, i) => {
        const hi = !!plan.highlighted;
        return (
          <Card
            key={`${plan.name}-${i}`}
            as="article"
            interactive={false}
            className={cn(
              "flex min-w-0 flex-col",
              hi && "border-brand-600 shadow-3 ring-1 ring-brand-600 lg:-translate-y-3",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-17 font-semibold text-ink">{plan.name}</h3>
              {plan.badge && <Badge strong={hi}>{plan.badge}</Badge>}
            </div>
            <div className="mt-5"><Price plan={plan} toggle={toggle} /></div>
            {plan.description && <p className="mt-3 text-14 text-muted">{plan.description}</p>}
            <Features features={plan.features ?? []} className="mt-6 border-t border-line pt-6" />
            <div className="mt-auto pt-7">
              <PlanCta plan={plan} primary={hi} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** A comparison cell: `yes` and `no` are glyphs with their words for a screen reader. */
function Cell({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").trim();
  if (v.toLowerCase() === "yes") {
    return (
      <>
        <IconCheck className="mx-auto size-5 text-brand-ink" aria-hidden="true" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (v.toLowerCase() === "no" || v === "") {
    return (
      <>
        <span className="text-faint" aria-hidden="true">—</span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-14 text-ink-2">{v}</span>;
}

/**
 * `comparison`: a real table, plans as columns. The scroller is `w-0
 * min-w-full` — a scroll container still hands its content's min-content
 * width to the grid item holding it, and a width of zero contributes nothing
 * — so at 320px the table scrolls inside itself and the page never does. The
 * first column is sticky over an opaque card ground.
 */
function Comparison({ set, toggle }: { set: PricingSet; toggle: boolean }) {
  const plans = set.plans;
  const rows = set.rows ?? [];

  // Consecutive rows sharing a group form one tbody under a header row.
  const groups: { name: string | null; rows: typeof rows }[] = [];
  for (const row of rows) {
    const name = row.group?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.rows.push(row);
    else groups.push({ name, rows: [row] });
  }

  const sticky = "sticky left-0 z-10 bg-(--color-card)";

  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-card">
      {/*
        `relative`: the cells' sr-only "Included" labels are absolutely
        positioned, and an absolute box escapes a scroller that is not its
        containing block — they reached x=548 at 360px and the page scrolled
        by 188px with no visible element over the edge (the CLAUDE.md note on
        a `sr-only` span inside a scroll box).
      */}
      <div className="relative w-0 min-w-full overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <caption className="sr-only">{set.label}: plans compared</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <td className={cn(sticky, "w-[12rem] min-w-[10rem] p-4")} />
              {plans.map((plan, i) => (
                <th
                  key={`${plan.name}-${i}`}
                  scope="col"
                  className={cn("min-w-[9rem] p-4 text-center align-bottom font-normal", plan.highlighted && "bg-brand-50")}
                >
                  {plan.badge && <span className="mb-2 block"><Badge strong={!!plan.highlighted}>{plan.badge}</Badge></span>}
                  <span className="block text-15 font-semibold text-ink">{plan.name}</span>
                  <span className="mt-2 block"><CompactPrice plan={plan} toggle={toggle} /></span>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g, gi) => (
            <tbody key={gi}>
              {g.name && (
                <tr className="bg-surface-2">
                  <th scope="rowgroup" colSpan={plans.length + 1} className="px-4 py-2.5 text-12 font-semibold uppercase tracking-[.08em] text-muted">
                    <span className="sticky left-4">{g.name}</span>
                  </th>
                </tr>
              )}
              {g.rows.map((row, ri) => (
                <tr key={`${row.label}-${ri}`} className="border-t border-line">
                  <th scope="row" className={cn(sticky, "px-4 py-3 text-14 font-medium text-ink")}>{row.label}</th>
                  {plans.map((plan, ci) => (
                    <td key={ci} className={cn("px-4 py-3 text-center", plan.highlighted && "bg-brand-50")}>
                      <Cell value={row.cells?.[ci]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          {plans.some((p) => p.cta?.href) && (
            <tfoot>
              <tr className="border-t border-line-strong">
                <td className={cn(sticky, "p-4")} />
                {plans.map((plan, i) => (
                  <td key={i} className={cn("p-4", plan.highlighted && "bg-brand-50")}>
                    <PlanCta plan={plan} primary={!!plan.highlighted} className="px-3" />
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** A table header's price: the figure and its suffix on a smaller scale. */
function CompactPrice({ plan, toggle }: { plan: PricingPlan; toggle: boolean }) {
  const face = (shown: Shown) =>
    shown ? (
      <span className="inline-flex flex-wrap items-baseline justify-center gap-x-1">
        <span className="font-display text-22 font-bold tabular-nums text-ink">{shown.amount}</span>
        {shown.suffix && <span className="text-12 text-muted">{shown.suffix}</span>}
      </span>
    ) : (
      <span className="text-14 font-semibold text-ink">On request</span>
    );
  if (plan.price_label) return face({ amount: plan.price_label, suffix: null });
  if (!toggle) return face(pick(plan, "monthly"));
  return (
    <>
      <span data-period="monthly">{face(pick(plan, "monthly"))}</span>
      <span data-period="yearly">{face(pick(plan, "yearly"))}</span>
    </>
  );
}

/** `single_focus`: one plan, large — the price and the button beside what it includes. */
function SingleFocus({ plan, toggle }: { plan: PricingPlan; toggle: boolean }) {
  return (
    <Card as="article" interactive={false} padding="none" className="mx-auto max-w-5xl overflow-hidden border-brand-600/40">
      <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-5 border-b border-line p-6 sm:p-8 md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-19 font-semibold text-ink">{plan.name}</h3>
            {plan.badge && <Badge strong>{plan.badge}</Badge>}
          </div>
          <Price plan={plan} toggle={toggle} size="lg" />
          {plan.description && <p className="text-15 text-muted">{plan.description}</p>}
          <div className="mt-auto pt-2"><PlanCta plan={plan} primary /></div>
        </div>
        <div className="min-w-0 p-6 sm:p-8">
          <p className="text-12 font-semibold uppercase tracking-[.1em] text-muted">What is included</p>
          <Features features={plan.features ?? []} className="mt-5 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3 sm:space-y-0" />
        </div>
      </div>
    </Card>
  );
}
