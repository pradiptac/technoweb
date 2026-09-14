import { Container } from "@/components/ui/container";
import { Backdrop, type BackdropVariant } from "@/components/ui/backdrop";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight } from "@/components/icons";
import { contact } from "@/content/site";
import { getSiteSettings } from "@/lib/settings";
import { telHref } from "@/lib/site-settings";

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
 * `async`, reading the settings itself rather than taking a prop, the call
 * `PageHero` already makes for its banner: twenty-two call sites would each
 * have had to fetch and thread it, and the one that forgot would go on
 * rendering the placeholder with nothing saying so. It costs nothing —
 * `getSiteSettings` is a tagged fetch that Next dedupes within a render.
 *
 * `?? contact.phone` for an install whose setting is unset, which is the same
 * fallback `site-header.tsx` uses.
 */
export async function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
  tone = "accent",
  size = "md",
  backdrop = "grid",
  className,
}: {
  title?: string;
  body?: string;
  /**
   * `accent` is the band on the inner pages; `brand` is the homepage's
   * closer, which used to be its own `FinalCta` — a drifted copy of this
   * component with the other ramp, a larger heading and no `Backdrop`.
   */
  tone?: "accent" | "brand";
  /** `lg` is the homepage's display-2 heading and taller padding. */
  size?: "md" | "lg";
  /** The `motion_hero` decoration; the homepage passes the setting through. */
  backdrop?: BackdropVariant;
  /** On the `<section>` — the homepage overrides `section-y` with a bottom-only padding. */
  className?: string;
}) {
  const settings = await getSiteSettings();
  const phone = settings.phone ?? contact.phone;
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
