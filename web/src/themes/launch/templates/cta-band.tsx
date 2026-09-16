import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Launch's closing band: a rounded panel on the brand's deep steps, the
 * words centred, two pill buttons.
 *
 * `brand-800` to `brand-900` — the steps that stay dark under white in
 * both schemes, which the palette gate checks ("white on brand-900") — so
 * the panel is `text-white` the way every `bg-dark` band is. `brand` and
 * `accent` tones differ in which ramp's deep steps it uses.
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
    <section className={cn("section-y", className)}>
      <Container>
        <div
          data-aos="fade-up"
          className={cn(
            "relative overflow-hidden rounded-3xl px-7 text-center text-white",
            tone === "brand" ? "bg-linear-135 from-brand-800 to-brand-900" : "bg-linear-135 from-accent-800 to-accent-900",
            size === "lg" ? "py-16 lg:py-24" : "py-12 lg:py-16",
          )}
        >
          <div className="mx-auto max-w-[44ch]">
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <p className="mt-4 text-15 leading-relaxed text-[rgba(255,255,255,.82)]">{body}</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact" variant="onDark">
              Book a site audit <IconArrowRight />
            </ButtonLink>
            <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/30 text-white">
              Call {phone}
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
