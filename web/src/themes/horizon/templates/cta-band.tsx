import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Horizon's closing band: a card split by the two separator colours — a
 * bar of the secondary along the top, the accent along the foot — the
 * words on the left and the buttons on the right, on `card`. `tone`
 * swaps which colour takes the top bar. Ink on card in both schemes, so
 * the contrast is the page's.
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
            "grid items-center gap-8 rounded-lg border border-line-strong border-t-[6px] border-b-[6px] bg-card px-7 lg:grid-cols-[1.4fr_auto] lg:px-10",
            tone === "brand" ? "border-t-brand-600 border-b-accent-500" : "border-t-secondary-500 border-b-accent-500",
            size === "lg" ? "py-12 lg:py-16" : "py-9 lg:py-11",
          )}
        >
          <div>
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <p className="mt-3 text-15 leading-relaxed text-muted">{body}</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <ButtonLink href="/contact">Book a demo <IconArrowRight /></ButtonLink>
            <ButtonLink href={telHref(phone)} variant="secondary">Call {phone}</ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
