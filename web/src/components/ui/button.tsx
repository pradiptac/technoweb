import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "onDark" | "onDarkOutline" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-2 hover:bg-brand-700 hover:-translate-y-px",
  // Outlined, neutral at rest; the secondary colour appears on hover. A
  // filled secondary button everywhere would fight the primary one.
  secondary:
    "bg-card text-ink border-line-strong shadow-1 hover:border-secondary-400 hover:text-secondary-ink",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
  /*
   * `bg-err-fill`, not `bg-err`.
   *
   * `--color-err` does two jobs, and in dark they want opposite values: it is
   * coloured *text* on a panel (alerts, badges, the dashboard's figures),
   * which means it inverts to a light pink — and white text on light pink is
   * 2.4:1. Every Delete button in the console was that, on twelve edit
   * screens, until the audit started opening them.
   *
   * Same split, and the same reasoning, as `--color-brand-ink`: one token for
   * the fill under white text, one for the colour text is drawn in. In light
   * they are the same value; in dark they cannot be.
   */
  destructive: "bg-err-fill text-white hover:brightness-110",
  /*
   * `bg-dark-ink`, not `bg-card`.
   *
   * This button sits on a dark band, which stays dark in both schemes — so its
   * background has to stay light in both. `bg-card` was white before the token
   * existed; in dark it inverts to near-black and the button becomes dark text
   * on a dark fill at 1.1:1. `dark-ink` is the light-on-dark token and does not
   * move.
   */
  onDark: "bg-dark-ink text-dark hover:bg-brand-50",
  onDarkOutline: "bg-transparent text-dark-ink border-dark-line hover:border-dark-muted",
  /*
   * Soft UI over the brand fill, with a glow on hover.
   *
   * The first cut of this was grey-on-grey, faithful to the reference and a
   * poor primary CTA: no fill and no border means the edge is a soft shadow at
   * ~1.2:1, where WCAG 1.4.11 asks 3:1 for a control's boundary. Putting the
   * extrusion back over `brand-600` returns both the boundary and the brand,
   * and **`white on brand-600` is one of the eighteen pairings every theme is
   * measured on**, so the label holds in all twenty-four without a check here.
   *
   * It also gains the layer the grey version had to drop. On the white header
   * a white inner highlight measured 1.00:1 — correct CSS painting nothing;
   * over a coloured face it has somewhere to go, so this is the one place the
   * full four-shadow recipe actually renders.
   *
   * The hover glow is `color-mix` against the brand tokens rather than a
   * colour, so it is whatever the active theme's brand is. Pressing swaps the
   * outer pair for a deeper inner one, so the face sinks rather than the whole
   * control sliding down the page.
   */
  soft:
    /*
     * `shadow-[var(--shadow-soft)]`, not `shadow-soft`.
     *
     * Tailwind v4 resolves a `--shadow-*` token into the utility **at build
     * time**, so `shadow-soft` compiles to whatever `:root` said and never
     * looks at the value again. Redefining the token under
     * `:root[data-scheme="dark"]` then does nothing at all: the token was
     * correct, the computed style was the light one, and the dark header wore a
     * 95%-white inner rim that looked like a glowing outline. The arbitrary
     * value emits `box-shadow: var(--shadow-soft)`, which is resolved when the
     * element is painted and therefore follows the scheme.
     *
     * The three `shadow-1/2/3` tokens never hit this because none of them is
     * redefined per scheme — this is the first one that had to be.
     */
    "bg-brand-600 text-white shadow-[var(--shadow-soft-brand)] " +
    "hover:-translate-y-px hover:shadow-[var(--shadow-soft-brand-glow)] " +
    "active:translate-y-0 active:shadow-[var(--shadow-soft-pressed)]",
};

/** All sizes clear the 44px minimum touch target. */
const sizes: Record<Size, string> = {
  sm: "text-[13.5px] px-4 py-[11px]",
  md: "text-[15px] px-[22px] py-[13px]",
  lg: "text-base px-[26px] py-[15px]",
};

const shared =
  "inline-flex items-center justify-center gap-2 rounded font-semibold border border-transparent " +
  "transition-all duration-200 ease-brand cursor-pointer whitespace-nowrap " +
  // 45% put a ghost button at 1.85:1 on the surface behind it, which is
  // hard to read rather than merely inactive. WCAG exempts disabled
  // controls from the contrast minimum, so this is a legibility call, not
  // a compliance one — and it stays well short of looking enabled.
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

type BaseProps = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: BaseProps & ComponentProps<"button">) {
  return <button className={cn(shared, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: BaseProps & ComponentProps<typeof Link>) {
  return <Link href={href} className={cn(shared, variants[variant], sizes[size], className)} {...props} />;
}

/** Inline text link with the arrow that nudges on hover. */
export function ArrowLink({
  href, children, className,
}: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-brand-ink",
        "transition-all duration-200 ease-brand hover:gap-2.5",
        className,
      )}
    >
      {children}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
        <path d="M4.8 12h14.4M13.2 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
