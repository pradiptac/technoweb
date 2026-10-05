import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import { ArrowLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { RetroGrid } from "@/components/velora/retro-grid";
import { SectionHeader } from "@/components/ui/card";
import { Collection, Tile } from "@/components/ui/collection";
import type { Certification } from "@/types/api";

/**
 * The company's certifications, compactly: badge, name, issuer, and a link
 * to the page that carries the numbers. Null when there are none — a strip
 * saying "we are certified in nothing" is not a strip anybody wants.
 */
export function Credentials({ items }: { items: Certification[] }) {
  if (items.length === 0) return null;

  return (
    <section id="certified" className="relative overflow-hidden section-y">
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
        {/*
          A `Collection` of `certifications`, drawn in each theme's idiom —
          see `components/ui/collection.tsx`. The certificate sits in the
          icon slot as a 3:4 portrait — it is a sheet of paper — so an
          idiom that moves the icon moves it. `min-w-0` on each item: the
          issuer is `truncate`, and `nowrap` text makes a grid item's
          min-content the full run of it — at 320px the card ran 16px past
          the screen. The phone audit named it. The name runs to two lines
          instead: cut to "MSME Udyam regis…" it was the one thing the card
          is for (the proportion review, 2026-10-05).
        */}
        <Collection fill kind="certifications" cols={4} className="mt-8">
          {items.slice(0, 6).map((c) => (
            <Tile
              key={c.id}
              titleAs="b"
              title={<span className="line-clamp-2 [overflow-wrap:anywhere]">{c.name}</span>}
              summary={c.issuer && <span className="block truncate">{c.issuer}</span>}
              padding="sm"
              icon={
                <span data-tile-portrait className="relative block h-20 w-[60px] overflow-hidden rounded-md border border-line bg-surface-2">
                  {c.image && (
                    <Image src={c.image} alt={c.image_alt} fill sizes="60px" className="object-cover" style={focalStyle(c.image_focus)} />
                  )}
                </span>
              }
            />
          ))}
        </Collection>
      </Container>
    </section>
  );
}
