import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SectionButton } from "@/types/api";

/**
 * The pieces every builder section is made of (`docs/page-builder.md`).
 *
 * `SectionFrame` is the band: the public site's vertical rhythm
 * (`.section-y`) and a reveal, with the type named in `data-page-section`
 * so a theme's `theme.css` can restyle one kind by attribute — the
 * `[data-collection]` rule, applied to sections. Nothing theme-specific
 * lives here.
 *
 * `SectionHead` is the kicker, the heading and the lede. The heading is an
 * `h2`: the page's one `h1` is a builder hero's when that is first, and
 * `PageHero`'s otherwise, so a section is always one level below it.
 */
export function SectionFrame({
  type, size = "md", className, children,
}: {
  type: string;
  size?: "md" | "lg" | "none";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-page-section={type}
      data-aos="fade-up"
      className={cn(size === "lg" ? "section-y-lg" : size === "md" ? "section-y" : "", className)}
    >
      {children}
    </section>
  );
}

export function SectionHead({
  kicker, heading, lede, center = false, className,
}: {
  kicker?: string | null;
  heading?: string | null;
  lede?: string | null;
  center?: boolean;
  className?: string;
}) {
  if (!kicker && !heading && !lede) return null;

  return (
    <div data-section-head className={cn("mb-10", center && "text-center", className)}>
      {kicker && (
        <span className="text-11-5 font-semibold uppercase tracking-[.13em] text-secondary-ink">{kicker}</span>
      )}
      {heading && <h2 className={cn("display-2 text-balance", kicker && "mt-3.5")}>{heading}</h2>}
      {lede && <p className={cn("lede measure mt-4", center && "mx-auto")}>{lede}</p>}
    </div>
  );
}

/** Up to two buttons: the first filled, the second outlined. A button with no label is not drawn. */
export function SectionButtons({
  primary, secondary, center = false, onDark = false, className,
}: {
  primary?: SectionButton | null;
  secondary?: SectionButton | null;
  center?: boolean;
  onDark?: boolean;
  className?: string;
}) {
  const buttons = [primary, secondary].filter((b): b is { label: string; href: string } => Boolean(b?.label && b?.href));
  if (!buttons.length) return null;

  return (
    <div className={cn("mt-8 flex flex-wrap gap-3", center && "justify-center", className)}>
      {buttons.map((b, i) => (
        <ButtonLink
          key={`${i}-${b.href}`}
          href={b.href}
          variant={i === 0 ? "primary" : "secondary"}
          size="lg"
          className={cn(i === 1 && onDark && "border-dark-line bg-transparent text-dark-ink shadow-none hover:text-dark-ink")}
        >
          {b.label}
        </ButtonLink>
      ))}
    </div>
  );
}
