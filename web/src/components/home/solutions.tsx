import { ArrowLink } from "@/components/ui/button";
import { Card, CardHead, SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { hueForIcon } from "@/components/ui/icon-tile";
import type { Solution } from "@/types/api";

export function Solutions({ items }: { items: Solution[] }) {
  return (
    <section data-aos="fade-up" id="solutions" className="section-y-lg">
      <Container>
        <SectionHeader
          kicker="Solutions"
          title="Infrastructure built once, supported for years."
          lede="Nine practice areas, one accountable partner — from the switch fabric to the firewall policy to the AMC contract behind it."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            return (
              <Card key={s.slug} tint={hueForIcon(s.icon)} beam>
                <CardHead iconName={s.icon}>{s.title}</CardHead>
                <p className="text-14-5 leading-[1.58] text-muted">{s.summary}</p>
                <ArrowLink href={`/solutions/${s.slug}`} className="mt-4">
                  Explore {s.title.toLowerCase()}
                </ArrowLink>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
