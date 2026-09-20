import { SectionHeader } from "@/components/ui/card";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import type { Industry } from "@/types/api";

/**
 * A `Collection` of `industries`, so each theme draws it in its own idiom
 * — see `components/ui/collection.tsx`. The title is a `b`: these are
 * links in a grid under the section's `h2`, not headings of their own.
 */
export function Industries({ items }: { items: Industry[] }) {
  return (
    <section id="industries" className="border-y border-line bg-surface section-y-lg">
      <Container>
        <SectionHeader
          kicker="Industries"
          title="Different floors, different failure modes."
          lede="A hospital network and a factory network fail in completely different ways. We build for the one you actually run."
        />
        <Collection kind="industries" cols={3} gap="sm">
          {items.map((i) => (
            <Tile
              key={i.slug}
              href={`/industries/${i.slug}`}
              titleAs="b"
              title={i.name}
              summary={i.summary}
              icon={<IconTile name={i.icon} fallback="building" />}
              hue={hueForIcon(i.icon, "building")}
              cta="See how we build for it"
            />
          ))}
        </Collection>
      </Container>
    </section>
  );
}
