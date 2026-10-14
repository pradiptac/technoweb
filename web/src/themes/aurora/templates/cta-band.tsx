import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Aurora's closing card: the wash again, on the page rather than on a band.
 *
 * Every other theme closes on something dark, which is the convention and
 * is right for them. Aurora's whole argument is that it never goes hard,
 * so the close is the same wash as the hero in a rounded card on the
 * page's own ground, with the words in the page's own ink. **That is why
 * the stops are the 50 tints and not the 900 steps**: the band's dark
 * tokens are fixed in both schemes, and this card has to invert with the
 * page or the dark scheme would have one bright slab in it.
 *
 * `tone` still picks which ramp the wash leans into, so a section that
 * asks for the accent gets it.
 */
export function CtaBand({
  title = "Let's find the right fit.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  className,
  phone,
  kicker,
  primary,
  secondary,
}: CtaBandProps) {
  return (
    <section className={cn("section-y", className)}>
      <Container>
        <div
          data-aos="fade-up"
          className={cn(
            "aurora-close relative overflow-hidden rounded-[28px] px-7 text-center",
            tone === "brand" ? "bg-linear-to-br from-brand-50 via-card to-secondary-50" : "bg-linear-to-br from-accent-50 via-card to-brand-50",
            size === "lg" ? "py-16 lg:py-24" : "py-12 lg:py-16",
          )}
        >
          <div className="relative mx-auto max-w-[46ch]">
            {kicker && <p className="mb-3 text-12 font-semibold uppercase tracking-[.14em] text-brand-ink">{kicker}</p>}
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance text-ink")}>{title}</h2>
            <p className="mt-4 text-15 leading-relaxed text-ink-2">{body}</p>
          </div>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={primary?.href || "/contact"} size="lg">{primary?.label || "Talk to us"} <IconArrowRight /></ButtonLink>
            {secondary === null ? null : secondary ? (
              <ButtonLink href={secondary.href} variant="secondary" size="lg">{secondary.label}</ButtonLink>
            ) : (
              <ButtonLink href={telHref(phone)} variant="secondary" size="lg">Call {phone}</ButtonLink>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
