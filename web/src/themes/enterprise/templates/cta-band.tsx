import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Enterprise's closing band: full-bleed on the brand's deep step, the
 * words left and the two buttons right — the corporate "talk to us" strip.
 * `brand-900` under white in both schemes, the step the palette gate
 * checks; `accent` (inner pages) takes the accent ramp's deep step.
 */
export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  className,
  phone,
}: CtaBandProps) {
  return (
    <section className={cn(tone === "brand" ? "bg-brand-900" : "bg-accent-900", "text-white", className)}>
      <Container className={cn("grid items-center gap-8 lg:grid-cols-[1.4fr_auto]", size === "lg" ? "py-16 lg:py-20" : "py-12 lg:py-14")}>
        <div data-aos="fade-up">
          <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
          <p className="mt-3 text-15 leading-relaxed text-[rgba(255,255,255,.82)]">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <ButtonLink href="/contact" variant="onDark">Book a site audit <IconArrowRight /></ButtonLink>
          <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/30 text-white">Call {phone}</ButtonLink>
        </div>
      </Container>
    </section>
  );
}
