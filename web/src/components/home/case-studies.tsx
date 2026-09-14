import Image from "next/image";
import { Card, SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { IconCert } from "@/components/icons";
import type { CaseStudy } from "@/types/api";

export function CaseStudies({ items }: { items: CaseStudy[] }) {
  return (
    <section data-aos="fade-up" className="section-y-lg">
      <Container>
        <SectionHeader
          kicker="Case studies"
          title="Projects, with the numbers attached."
          lede="Selected deployments where the brief was clear, the constraints were real and the outcome is measurable."
        />
        <div className="grid items-stretch gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((c) => {
            return (
              <Card key={c.slug} href={`/case-studies/${c.slug}`} padding="none" className="group flex h-full flex-col overflow-hidden">
                {/* Same 4:3 well as the product category tiles, so a slow
                    image cannot shuffle the grid and the two grids read as
                    one family. */}
                <span className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-linear-135 from-brand-800 to-brand-600">
                  {c.cover_image
                    ? <Image src={c.cover_image} alt={c.cover_image_alt ?? ""} fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover:scale-[1.04]" />
                    : <IconCert className="size-11 text-white/35" />}
                </span>
                <span className="flex flex-1 flex-col px-4 py-3.5">
                  <span className="text-11 font-semibold uppercase tracking-[.1em] text-secondary-ink">
                    {c.industry?.name ?? c.client_name ?? "Case study"}
                  </span>
                  <b className="mt-1 mb-1 truncate text-14-5 font-semibold leading-tight text-ink">{c.title}</b>
                  <span className="truncate text-12-5 text-muted">{c.summary}</span>
                  <dl className="mt-3 flex gap-5 border-t border-line pt-3">
                    {(c.results ?? []).slice(0, 2).map((r) => (
                      <div key={r.label}>
                        <dd className="block font-display text-base font-semibold tracking-[-.02em]">{r.value}</dd>
                        <dt className="text-11 text-muted">{r.label}</dt>
                      </div>
                    ))}
                  </dl>
                </span>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
