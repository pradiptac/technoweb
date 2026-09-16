import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Datacenter's closing band: a dark panel with the accent as a rule down
 * its left edge and a mono label in the corner — a console notice rather
 * than a marketing box. The dark ground tokens, so it is the same in both
 * schemes; `brand` (the homepage) makes the rule the brand colour and
 * `accent` (inner pages) the accent.
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
            "relative overflow-hidden rounded-md border border-dark-line border-l-4 bg-dark px-7 py-9 text-dark-ink sm:px-10",
            tone === "brand" ? "border-l-brand-400" : "border-l-accent-400",
            size === "lg" ? "lg:py-14" : "lg:py-11",
          )}
        >
          <span className="absolute right-4 top-3 font-mono text-11 uppercase tracking-[.14em] text-dark-muted">{"// next step"}</span>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <div>
              <p className="max-w-[52ch] text-15 leading-relaxed text-dark-muted">{body}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/contact" variant="onDark">
                  Book a site audit <IconArrowRight />
                </ButtonLink>
                <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/25 text-white">
                  Call {phone}
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
