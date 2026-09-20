import { Backdrop } from "@/components/ui/backdrop";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { telHref } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { CtaBandProps } from "@/themes/contract";

/**
 * The closing band on twenty-three public pages, the homepage included.
 *
 * **The telephone number is the site's, not `content/site.ts`'s.** It read the
 * static constant, which is the seeded placeholder `+91 98765 43210` — the one
 * on this project's must-not-ship list — so changing the real number in
 * Settings moved it in the header, the footer, the contact page, the support
 * page and the homepage, and left it wrong at the foot of every other page on
 * the site. That is worse than a number that is wrong everywhere: it is a
 * number somebody has already corrected, still being published.
 *
 * The number is resolved by the dispatcher in `components/ui/cta-band.tsx`
 * and arrives as `phone`: twenty-two call sites would each have had to
 * fetch and thread it, and the one that forgot would go on rendering the
 * placeholder with nothing saying so. Classic's template, moved here
 * verbatim on 2026-09-16.
 */
export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  backdrop = "grid",
  className,
  phone,
}: CtaBandProps) {
  const large = size === "lg";

  return (
    <section className={cn("section-y", className)}>
      <Container>
        <div
          data-aos="fade-up"
          className={cn(
            "relative overflow-hidden rounded-xl px-8 py-11 text-center text-white sm:px-10",
            tone === "brand" ? "bg-brand-900" : "bg-accent-900",
            large ? "sm:py-15" : "sm:py-14",
          )}
        >
          <Backdrop
            variant={backdrop}
            tone="brand"
            size={48}
            mask="radial-gradient(ellipse 60% 80% at 50% 0%, #000, transparent 70%)"
          />
          <div className="relative">
            <h2 className={cn(large ? "display-2" : "display-3", "text-white")}>{title}</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-dark-muted-brand">{body}</p>
            <div className={cn("flex flex-wrap justify-center gap-3", large ? "mt-7.5" : "mt-7")}>
              <ButtonLink href="/contact" variant="onDark">
                Book a site audit <IconArrowRight />
              </ButtonLink>
              {/* A tel: link rather than a second route to /contact — on a
                  phone this should dial, which is the point of putting a
                  number on a call to action. */}
              <ButtonLink href={telHref(phone)} variant="onDarkOutline" className="border-white/25 text-white">
                Call {phone}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
