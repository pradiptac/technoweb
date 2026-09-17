import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Summit's closing band: "book a demo" — a dark rounded panel, the words
 * centred, a brand glow behind them, two buttons. The dark ground tokens,
 * so it is the same in both schemes; the glow is the ramp's fill at low
 * opacity, `brand` or `accent` by tone, and it is `aria-hidden` colour
 * behind opaque text the audit never grades.
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
        <div data-aos="fade-up" className={cn("relative overflow-hidden rounded-2xl border border-dark-line bg-dark px-7 text-center text-dark-ink", size === "lg" ? "py-16 lg:py-24" : "py-12 lg:py-16")}>
          <div aria-hidden className={cn("pointer-events-none absolute left-1/2 top-0 h-[360px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl", tone === "brand" ? "bg-brand-500" : "bg-accent-500")} />
          <div className="relative mx-auto max-w-[46ch]">
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <p className="mt-4 text-15 leading-relaxed text-dark-muted">{body}</p>
          </div>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact">Book a demo <IconArrowRight /></ButtonLink>
            <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/25 text-white">Call {phone}</ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
