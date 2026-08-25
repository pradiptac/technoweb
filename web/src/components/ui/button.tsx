import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "onDark" | "onDarkOutline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-2 hover:bg-brand-700 hover:-translate-y-px",
  secondary:
    "bg-card text-ink border-line-strong shadow-1 hover:border-faint",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
  destructive: "bg-err text-white hover:brightness-110",
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
