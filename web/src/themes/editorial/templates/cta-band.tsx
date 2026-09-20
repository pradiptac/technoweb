import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Editorial's closing band: a ruled notice, not a rounded card.
 *
 * Two hairlines, the headline on the left in the display serif, the copy
 * and the two actions on the right — a paper's classified box rather than
 * a marketing panel. On the page ground, so it inverts with the scheme the
 * way every other rule on the theme does; `brand` (the homepage) fills it
 * with `surface-2` to close the front page a shade heavier.
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
            "grid gap-6 border-y border-line-strong py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12",
            tone === "brand" && "bg-surface-2 px-6 sm:px-10",
            size === "lg" ? "lg:py-16" : "lg:py-12",
          )}
        >
          <h2 className={cn("font-display font-normal tracking-[-.01em] text-balance", size === "lg" ? "text-[clamp(30px,3vw+8px,46px)]" : "text-[clamp(26px,2vw+8px,36px)]")}>
            {title}
          </h2>
          <div>
            <p className="max-w-[52ch] text-15 leading-relaxed text-ink-2">{body}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/contact">
                Book a site audit <IconArrowRight />
              </ButtonLink>
              <ButtonLink href={telHref(phone)} variant="secondary">
                Call {phone}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
