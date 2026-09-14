import Image from "next/image";
import { ArrowLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RetroGrid } from "@/components/velora/retro-grid";
import { SectionHeader } from "@/components/ui/card";
import type { Certification } from "@/types/api";

/**
 * The company's certifications, compactly: badge, name, issuer, and a link
 * to the page that carries the numbers. Null when there are none — a strip
 * saying "we are certified in nothing" is not a strip anybody wants.
 */
export function Credentials({ items }: { items: Certification[] }) {
  if (items.length === 0) return null;

  return (
    <section data-aos="fade-up" className="relative overflow-hidden section-y">
      {/*
        Velora's retro grid in place of the halftone dots: an `aria-hidden`
        absolute layer under a `relative` Container, so it paints behind the
        copy rather than over it. `overflow-hidden` on the section, or its
        600vw plane widens a 320px document.
      */}
      <RetroGrid opacity={0.5} />
      <Container className="relative">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeader kicker="Certified" title="Accountable on paper, too" className="mb-0 max-w-[52ch]" />
          <ArrowLink href="/certifications">All certifications</ArrowLink>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/*
            `min-w-0` on each item: the name is `truncate`, and `nowrap` text
            makes a grid item's min-content the full run of it — at 320px the
            card ran 16px past the screen. The phone audit named it.
          */}
          {items.slice(0, 6).map((c) => (
            <li key={c.id} className="flex min-w-0 items-center gap-4 rounded-lg border-2 border-line-strong bg-card p-3.5">
              <span className="relative block h-20 w-[60px] shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
                {c.image && (
                  <Image src={c.image} alt={c.image_alt} fill sizes="60px" className="object-cover" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-15 font-semibold">{c.name}</span>
                {c.issuer && <span className="block truncate text-12-5 text-muted">{c.issuer}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
