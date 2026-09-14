import { Card, SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import type { Industry } from "@/types/api";

export function Industries({ items }: { items: Industry[] }) {
  return (
    <section data-aos="fade-up" id="industries" className="border-y border-line bg-surface section-y-lg">
      <Container>
        <SectionHeader
          kicker="Industries"
          title="Different floors, different failure modes."
          lede="A hospital network and a factory network fail in completely different ways. We build for the one you actually run."
        />
        <div className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            const tint = hueForIcon(i.icon, "building");
            return (
              <Card key={i.slug} href={`/industries/${i.slug}`} tint={tint} padding="md" className="flex flex-col">
                <span className="flex items-center gap-2.5">
                  <IconTile name={i.icon} fallback="building" />
                  <b className="font-display text-15-5 tracking-[-.02em]">{i.name}</b>
                </span>
                <span className="mt-1.5 text-13 text-muted">{i.summary}</span>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
