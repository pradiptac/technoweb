import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Canvas's closing band: the document's `callout-card-coral` — a rounded
 * card in the primary fill with the words on it and an *inverted* button,
 * canvas on coral. "The coral surface is the voltage", and this is the one
 * full-bleed moment it is spent on. `brand` is the primary fill under its
 * `brand-on` ink (graded by the palette gate); `accent` (inner pages) is
 * the document's `cta-band-dark` — the dark surface under the dark ink.
 */
export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  className,
  phone,
}: CtaBandProps) {
  const coral = tone === "brand";
  return (
    <section className={cn("section-y", className)}>
      <Container>
        <div
          data-aos="fade-up"
          className={cn(
            "rounded-xl px-8 lg:px-16",
            coral ? "bg-brand-600 text-brand-on" : "border border-dark-line bg-dark text-dark-ink",
            size === "lg" ? "py-14 lg:py-16" : "py-11 lg:py-12",
          )}
        >
          <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_auto]">
            <div>
              <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
              <p className={cn("mt-4 text-15 leading-relaxed", coral ? "opacity-90" : "text-dark-muted")}>{body}</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <ButtonLink href="/contact" variant={coral ? "onDark" : "primary"} className={coral ? "bg-page text-ink hover:bg-page/90" : undefined}>
                Book a site audit <IconArrowRight />
              </ButtonLink>
              <ButtonLink href={telHref(phone)} variant="onDarkOutline" className={coral ? "border-brand-on/40 text-brand-on" : "border-white/25 text-white"}>
                Call {phone}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
