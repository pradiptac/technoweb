import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight } from "@/components/icons";
import { contact } from "@/content/site";

export function CtaBand({
  title = "Let's look at what you're actually running.",
  body = "A site visit and an honest infrastructure audit — no obligation, no scripted sales call. You get the findings in writing whether or not you work with us.",
}: { title?: string; body?: string }) {
  return (
    <section className="py-16 lg:py-20">
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
              <ButtonLink href={contact.phoneHref} variant="onDarkOutline" className="border-white/25 text-white">
                Call {contact.phone}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
