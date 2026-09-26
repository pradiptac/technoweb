import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Sentinel's closing band: a full-width dark band between two seams —
 * the glowing hairline above and below — the words on the left in the
 * light display face and the two buttons on the right, the reference's
 * "existing customer?" row. The dark ground tokens, so it is the same in
 * both schemes; `tone` picks which ramp the seam and the glow take.
 */
export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  className,
  phone,
  kicker,
  primary,
  secondary,
}: CtaBandProps) {
  const seam = tone === "brand" ? "via-brand-300" : "via-accent-300";
  return (
    <section data-aos="fade-up" className={cn("relative overflow-hidden bg-dark text-dark-ink", className)}>
      <div aria-hidden className={cn("absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent", seam)} />
      <div aria-hidden className={cn("pointer-events-none absolute -left-32 top-1/2 size-[480px] -translate-y-1/2 rounded-full opacity-20 blur-3xl", tone === "brand" ? "bg-brand-500" : "bg-accent-500")} />
      <Container className={cn("relative grid items-center gap-8 lg:grid-cols-[1.3fr_auto]", size === "lg" ? "py-16 lg:py-24" : "py-12 lg:py-16")}>
        <div className="min-w-0">
          {kicker && <p className="mb-3 text-12 font-semibold uppercase tracking-[.14em]">{kicker}</p>}
          <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
          <p className="mt-4 max-w-[58ch] text-15 leading-relaxed text-dark-muted">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <ButtonLink href={primary?.href || "/contact"}>{primary?.label || "Book a site audit"} <IconArrowRight /></ButtonLink>
          {secondary === null ? null : secondary ? (
            <ButtonLink href={secondary.href} variant="onDarkOutline" className="border-white/25 text-white">{secondary.label}</ButtonLink>
          ) : (
            <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/25 text-white">Call {phone}</ButtonLink>
          )}
        </div>
      </Container>
    </section>
  );
}
