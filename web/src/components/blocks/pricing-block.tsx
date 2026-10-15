import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { IconCheck } from "@/components/icons-ui";
import { CopyLink } from "@/components/ui/copy-link";
import { formatPaise } from "@/lib/money";
import { yearlyDeal } from "@/lib/pricing-deal";
import { cn } from "@/lib/utils";
import type { ContentBlock, PricingContent, PricingPlan, PricingSet } from "@/types/blocks";
import { PricingSwitch, type Period } from "./pricing-switch";

type PricingBlockData = Extract<ContentBlock, { type: "pricing" }>;

/**
 * A pricing table (content block `type: "pricing"`), in four layouts.
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

  const promo = c.promo?.trim() ? <PromoChip text={c.promo.trim()} /> : null;
  const guarantees = (c.guarantees ?? []).map((g) => g.trim()).filter(Boolean);

  const body = (
    <>
      <BlockHeader content={c} />
      {sets.length > 1 || billing ? (
        <PricingSwitch labels={sets.map((s) => s.label)} billing={billing} promo={promo} panels={panels} />
      ) : (
        <div className="blk-pricing" data-billing="monthly">
          {promo && <div className="mb-8 flex justify-center">{promo}</div>}
          {panels[0]}
        </div>
      )}
      {guarantees.length > 0 && (
        <ul data-pricing-guarantees="" className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-12 font-semibold uppercase tracking-[.12em] text-muted">
          {guarantees.map((g, i) => (
            <li key={`${g}-${i}`} className="flex items-center gap-2">
              <IconCheck className="size-4 shrink-0 text-brand-ink" aria-hidden="true" />
              {g}
            </li>
          ))}
        </ul>
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
  if (layout === "banded") return <Banded plans={set.plans} toggle={toggle} />;
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

/** The promotion beside the billing toggle ("20% off · ends soon"): a fill under its own ink, as every theme grades it. */
function PromoChip({ text }: { text: string }) {
  return <span className="inline-flex items-center bg-brand-600 px-2.5 py-1 text-12 font-semibold uppercase tracking-[.12em] text-brand-on">{text}</span>;
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

/* ----------------------------------------------------------------- banded */

/**
 * `banded`: plans side by side under a coloured bar — the plan's badge (or
 * "Plan") and its number. The colour is the theme's own, by position:
 * brand, secondary, accent, then the info fill (`[data-band]` in
 * `blocks.css`), each with the ink graded for it, so no colour is typed and
 * every palette passes. Under the yearly period a plan with both prices shows
 * the deal `yearlyDeal()` works out; under the monthly one, the monthly price.
 * Themes restyle it by attribute (`data-pricing-layout="banded"`).
 */
function Banded({ plans, toggle }: { plans: PricingPlan[]; toggle: boolean }) {
  return (
    <div data-pricing-layout="banded" className={cn("grid items-stretch gap-px overflow-hidden rounded-lg border border-line-strong bg-line-strong", bandColumns(plans.length))}>
      {plans.map((plan, i) => (
        <article key={`${plan.name}-${i}`} data-band={i % 4} data-highlighted={plan.highlighted ? "" : undefined} className="relative flex min-w-0 flex-col bg-card">
          <div data-band-bar="" className="flex items-center justify-between gap-3 bg-(color:--band) px-5 py-3 text-12 font-semibold uppercase tracking-[.16em] text-(color:--band-on)">
            <span className="min-w-0 truncate">{plan.badge || "Plan"}</span>
            <span aria-hidden="true" className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          </div>
          <div className="flex flex-1 flex-col p-6">
            <BandedHead plan={plan} toggle={toggle} />
            {plan.description && <p className="mt-2 text-15 text-muted">{plan.description}</p>}
            <div className="mt-6"><BandedPrice plan={plan} toggle={toggle} /></div>
            <BandedCta plan={plan} />
            {(plan.features ?? []).length > 0 && (
              <div className="mt-8">
                <p data-band-label="" className="text-12 font-semibold uppercase tracking-[.16em] text-muted">What you get</p>
                <ul className="mt-4 space-y-3">
                  {(plan.features ?? []).map((f, fi) => (
                    <li key={`${f}-${fi}`} className="flex gap-3 text-15 text-ink">
                      <span data-band-tick="" className="mt-0.5 inline-grid size-5 shrink-0 place-items-center border border-(color:--band-ink) text-(color:--band-ink)">
                        <IconCheck className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function bandColumns(n: number): string {
  if (n <= 1) return "mx-auto max-w-md";
  if (n === 2) return "mx-auto max-w-4xl md:grid-cols-2";
  if (n === 3) return "md:grid-cols-3";
  return "md:grid-cols-2 xl:grid-cols-4";
}

/** The plan's name, and the share off as a chip under the yearly period. */
function BandedHead({ plan, toggle }: { plan: PricingPlan; toggle: boolean }) {
  const deal = !plan.price_label && toggle ? yearlyDeal(plan.price_monthly_paise, plan.price_yearly_paise) : null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <h3 className="font-display text-24 font-bold leading-tight text-ink">{plan.name}</h3>
      {deal && (
        <span data-period="yearly" data-band-label="" className="bg-(color:--band) px-2.5 py-1 text-12 font-semibold uppercase tracking-[.12em] text-(color:--band-on)">
          {deal.percent}% off
        </span>
      )}
    </div>
  );
}

function BandedPrice({ plan, toggle }: { plan: PricingPlan; toggle: boolean }) {
  const big = "font-display text-[clamp(40px,2.4vw+24px,56px)] font-bold leading-none tracking-[-.03em] text-ink tabular-nums";
  if (plan.price_label) return <span className={big}>{plan.price_label}</span>;

  const deal = toggle ? yearlyDeal(plan.price_monthly_paise, plan.price_yearly_paise) : null;
  const face = (shown: Shown) => (shown ? (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={big}>{shown.amount}</span>
      {shown.suffix && <span className="text-15 text-muted">{shown.suffix}</span>}
    </span>
  ) : <span className={big}>On request</span>);

  if (!toggle) return face(pick(plan, "monthly"));
  return (
    <>
      <span data-period="monthly">{face(pick(plan, "monthly"))}</span>
      <span data-period="yearly">
        {deal ? (
          <>
            <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <s className="text-17 font-semibold text-err tabular-nums"><span className="sr-only">Was </span>{formatPaise(deal.was)}</s>
              <span className={big}>{formatPaise(deal.perMonth)}</span>
              <span className="text-15 text-muted">/mo</span>
            </span>
            <span data-band-label="" className="mt-3 block text-12 font-semibold uppercase tracking-[.14em] text-muted">
              {formatPaise(deal.billed)} billed yearly · <span className="whitespace-nowrap text-(color:--band-ink)">save {formatPaise(deal.save)}</span>
            </span>
          </>
        ) : face(pick(plan, "yearly"))}
      </span>
    </>
  );
}

/** The plan's button in its band colour, and a copy button beside it for an email link the editor switched one on for. */
function BandedCta({ plan }: { plan: PricingPlan }) {
  const href = plan.cta?.href;
  if (!href) return null;
  const email = plan.cta?.copy && href.startsWith("mailto:") ? decodeURIComponent(href.slice(7).split("?")[0]) : null;
  return (
    <div className="mt-7 flex items-stretch gap-px">
      <ButtonLink
        href={href}
        className="min-w-0 flex-1 whitespace-normal rounded-none bg-(color:--band) text-center uppercase tracking-[.16em] text-(color:--band-on) hover:bg-(color:--band) hover:brightness-110"
      >
        {plan.cta?.label || "Get started"}
      </ButtonLink>
      {email && (
        <CopyLink
          url={email}
          what="email address"
          className="inline-grid w-12 shrink-0 place-items-center bg-(color:--band) text-(color:--band-on) hover:brightness-110"
        />
      )}
    </div>
  );
}
