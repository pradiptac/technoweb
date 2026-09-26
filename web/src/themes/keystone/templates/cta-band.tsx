import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Keystone's closing card: the reference's "let's find the right fit" — a
 * rounded panel on the dark ground fading into the brand's deepest step,
 * the words centred, a filled pill and an outlined one. `dark` and
 * `brand-900` both stay dark under white in both schemes (the palette gate
 * checks white on brand-900), so the card is `text-white` the way every
 * `bg-dark` band is; `tone` picks which ramp the fade runs into.
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
            "rounded-3xl px-7 text-center text-white",
            tone === "brand" ? "bg-linear-to-br from-dark to-brand-900" : "bg-linear-to-br from-dark to-accent-900",
            size === "lg" ? "py-16 lg:py-24" : "py-12 lg:py-16",
          )}
        >
          <div className="mx-auto max-w-[44ch]">
            {kicker && <p className="mb-3 text-12 font-semibold uppercase tracking-[.14em]">{kicker}</p>}
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <p className="mt-4 text-15 leading-relaxed text-[rgba(255,255,255,.82)]">{body}</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={primary?.href || "/contact"}>{primary?.label || "Get a quote"} <IconArrowRight /></ButtonLink>
            {secondary === null ? null : secondary ? (
              <ButtonLink href={secondary.href} variant="onDarkOutline" className="border-white/30 text-white">{secondary.label}</ButtonLink>
            ) : (
              <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/30 text-white">Call {phone}</ButtonLink>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
