import type { CSSProperties, ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { SectionButton } from "@/types/api";

/**
 * The pieces every builder section is made of (`docs/page-builder.md`).
 *
 * `SectionFrame` is the band: the public site's vertical rhythm
 * (`.section-y`) and a reveal — `fade-up` unless the section chose another
 * (`reveal`, from `SECTION_REVEALS`) or none (`null`), with the type named in `data-page-section`
 * so a theme's `theme.css` can restyle one kind by attribute — the
 * `[data-collection]` rule, applied to sections. Nothing theme-specific
 * lives here.
 *
 * `SectionHead` is the kicker, the heading and the lede. The heading is an
 * `h2`: the page's one `h1` is a builder hero's when that is first, and
 * `PageHero`'s otherwise, so a section is always one level below it.
 */
export function SectionFrame({
  type, size = "md", reveal = "fade-up", className, children,
}: {
  type: string;
  reveal?: SectionRevealAttr | null;
  size?: "md" | "lg" | "none";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-page-section={type}
      data-aos={reveal ?? undefined}
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
      {heading && <h2 data-section-heading className={cn("display-2 text-balance", kicker && "mt-3.5")}><HeadlineWords text={heading} /></h2>}
      {lede && <p className={cn("lede measure mt-4", center && "mx-auto")}>{lede}</p>}
    </div>
  );
}

/**
 * A section heading's words, each in its own `<span data-word>` carrying its
 * position as `--w` (0.114.0, the section style's "Heading arrives"). The
 * spaces between them stay real text outside the spans, so the heading reads,
 * wraps and balances exactly as the plain string did; the spans are inline and
 * inert until `[data-headline="rise"]` in globals.css makes them
 * `inline-block` and staggers them on the heading's own scroll timeline —
 * inside the reduced-motion guard, so nobody else sees anything but the words.
 */
export function HeadlineWords({ text }: { text: string }) {
  let w = 0;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (!part) return null;
        if (/^\s+$/.test(part)) return part;
        return <span key={i} data-word style={{ "--w": w++ } as CSSProperties}>{part}</span>;
      })}
    </>
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
    <div data-section-buttons className={cn("mt-8 flex flex-wrap gap-3", center && "justify-center", className)}>
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
