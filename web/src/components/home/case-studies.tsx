import Image from "next/image";
import { SectionHeader } from "@/components/ui/card";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { IconCert } from "@/components/icons";
import type { CaseStudy } from "@/types/api";
import { CountUp } from "@/components/ui/count-up";

/**
 * A `Collection` of `case-studies`, drawn in each theme's idiom — see
 * `components/ui/collection.tsx`. Same 4:3 well as the product category
 * tiles, so a slow image cannot shuffle the grid and the two grids read
 * as one family; the two headline results ride in the tile's meta slot.
 */
export function CaseStudies({ items }: { items: CaseStudy[] }) {
  return (
    <section id="case-studies" className="section-y-lg">
      <Container>
        <SectionHeader
          kicker="Case studies"
          title="Projects, with the numbers attached."
          lede="Selected deployments where the brief was clear, the constraints were real and the outcome is measurable."
        />
        <Collection kind="case-studies" cols={6}>
          {items.map((c) => (
            <Tile
              key={c.slug}
              href={`/case-studies/${c.slug}`}
              titleAs="b"
              kicker={c.industry?.name ?? c.client_name ?? "Case study"}
              title={c.title}
              summary={c.summary}
              padding="sm"
              focus={c.cover_image_focus}
              media={c.cover_image
                ? <Image src={c.cover_image} alt={c.cover_image_alt ?? ""} fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover:scale-[1.04]" />
                : <span data-tile-well className="grid size-full place-items-center bg-linear-135 from-brand-800 to-brand-600"><IconCert className="size-11 text-white/35" /></span>}
              meta={(c.results ?? []).length > 0 && (
                <dl data-tile-results className="flex gap-5 border-t border-line pt-3">
                  {(c.results ?? []).slice(0, 2).map((r) => (
                    <div key={r.label}>
                      <CountUp as="dd" value={r.value} className="block font-display text-base font-semibold tracking-[-.02em] text-ink" />
                      <dt className="text-11 text-muted">{r.label}</dt>
                    </div>
                  ))}
                </dl>
              )}
              cta="Read the case study"
            />
          ))}
        </Collection>
      </Container>
    </section>
  );
}
