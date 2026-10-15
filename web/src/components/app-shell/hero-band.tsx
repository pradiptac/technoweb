import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The brand-lit band at the top of the dashboard and the portal home
 * (Console 2.0).
 *
 * Painted on the non-inverting dark steps (`brand-900` → `accent-900`), the
 * pair the theme gate already checks under white text, so the words read in
 * both schemes and in every palette. The first stop is opaque, which is what
 * lets the contrast audit grade the text against a real ground. The drifting
 * wash is a sibling layer behind the words, never their ancestor. The title
 * is a `<p>`: the page keeps its own `h1`.
 */
export function HeroBand({ title, summary, actions, className }: {
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-hero-band
      className={cn(
        "relative isolate overflow-hidden rounded-2xl bg-linear-120 from-brand-900 to-accent-900",
        "px-5 py-6 text-white shadow-3 sm:px-7 sm:py-7",
        className,
      )}
    >
      <span
        aria-hidden data-hero-wash
        className="pointer-events-none absolute -top-1/2 -right-1/4 -z-10 aspect-square w-[70%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-brand-500)_30%,transparent),transparent)]"
      />
      <p className="font-display text-xl font-semibold tracking-[-.02em] sm:text-[26px]">{title}</p>
      {/* White, not `dark-muted`: the theme gate checks white on both stops
          for every palette (scripts/theme-contrast.mjs) and nothing else. */}
      {summary && <p className="mt-1.5 text-14-5 text-white">{summary}</p>}
      {actions && <div data-tour="hero-actions" className="mt-5 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

/** The band's buttons: the first is solid, the rest outlined on the dark ground. */
export const HERO_ACTION = "inline-flex min-h-9 items-center rounded-full px-4 text-13-5 font-semibold transition-colors duration-(--duration-base)";
export const HERO_ACTION_PRIMARY = "bg-white text-brand-900 hover:opacity-90";
export const HERO_ACTION_SECONDARY = "border border-white/40 text-white hover:bg-white/10";
