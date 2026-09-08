import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight } from "@/components/icons";
import { contact } from "@/content/site";
import { getSiteSettings } from "@/lib/settings";
import { telHref } from "@/lib/site-settings";

/**
 * The closing band on twenty-two public pages.
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
}: { title?: string; body?: string }) {
  const settings = await getSiteSettings();
  const phone = settings.phone ?? contact.phone;

  return (
    <section className="section-y">
      <Container>
        <div
          data-aos="fade-up"
          className="relative overflow-hidden rounded-xl bg-brand-900 px-8 py-11 text-center text-white sm:px-10 sm:py-14"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_0%,#000,transparent_70%)]"
          />
          <div className="relative">
            <h2 className="display-3 text-white">{title}</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[#cdd6bb]">{body}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/contact" variant="onDark">
                Book a site audit <IconArrowRight />
              </ButtonLink>
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
