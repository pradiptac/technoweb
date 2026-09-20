import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * Terminal's closing band: a bordered box with a command in it.
 *
 * `$ book --site-audit` in the corner, the title in the display face, the
 * body as a quoted line, two bracketed buttons. The box is `ink` under
 * `page` — the two tokens that swap with the scheme together, so it is a
 * dark box on a light page and a light box on a dark one, the way a
 * terminal's colours invert with its theme. `brand` (the homepage) and
 * `accent` (inner pages) decide which ramp the left rule takes.
 */
export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  className,
  phone,
}: CtaBandProps) {
  // The rule alone carries the tone: a coloured `$` on the `ink` box read at
  // 1.59:1 in dark, where `ink` is light and the 300 step is too — the
  // prompt is the box's own text, which inverts with it.
  const ramp = tone === "brand" ? "border-l-brand-500" : "border-l-accent-500";
  return (
    <section className={cn("section-y", className)}>
      <Container>
        <div
          data-aos="fade-up"
          className={cn("border border-ink border-l-4 bg-ink px-7 py-9 text-page sm:px-10", ramp, size === "lg" ? "lg:py-14" : "lg:py-11")}
        >
          <p className="font-mono text-12-5 opacity-80"><span className="font-bold">$</span> book --site-audit</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
            <h2 className={cn(size === "lg" ? "display-2" : "display-3", "text-balance")}>{title}</h2>
            <div>
              <p className="text-15 leading-relaxed opacity-85"><span aria-hidden className="font-mono">{"> "}</span>{body}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/contact" variant="secondary" className="border-page/40 bg-page text-ink hover:bg-page/90">
                  book a site audit <IconArrowRight />
                </ButtonLink>
                <ButtonLink href={telHref(phone)} variant="secondary" className="border-page/40 bg-transparent text-page hover:bg-page/10">
                  call {phone}
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
