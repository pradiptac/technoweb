import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Vantage's closing band: a rounded panel in the accent fill — the
 * reference's cyan block — the words on the left, two pill buttons on the
 * right. `accent-600` under `accent-on` is a pair the palette gate checks
 * in both schemes; the `brand` tone uses the brand pair the same way.
 */
export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  className,
  phone,
}: CtaBandProps) {
  const fill = tone === "brand" ? "bg-brand-600 text-brand-on" : "bg-accent-600 text-accent-on";
  return (
    <section className={cn("section-y", className)}>
      <Container>
        <div data-aos="fade-up" className={cn("grid items-center gap-8 rounded-3xl px-7 lg:grid-cols-[1.3fr_auto] lg:px-12", fill, size === "lg" ? "py-14 lg:py-20" : "py-10 lg:py-14")}>
          <div className="min-w-0">
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <p className="mt-4 max-w-[58ch] text-15 leading-relaxed opacity-90">{body}</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <ButtonLink href="/contact" variant="onDark">Book a site audit <IconArrowRight /></ButtonLink>
            <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-current text-inherit">Call {phone}</ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
