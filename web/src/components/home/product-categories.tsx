import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import type { ProductCategory } from "@/types/api";

/**
 * A `Collection` of `categories`, drawn in each theme's idiom — see
 * `components/ui/collection.tsx`.
 *
 * A fixed 4:3 well, so a slow image cannot shuffle the grid — the rule
 * every other cover on this site follows — and a category with no image
 * yet falls back to its own tinted icon panel rather than leaving a hole
 * in the row. No count beside the name — the client's rule, 2026-09-19.
 */
export function ProductCategories({ items }: { items: ProductCategory[] }) {
  return (
    <section id="products" className="border-y border-line bg-surface section-y-lg">
      <Container>
        <SectionHeader
          kicker="Products"
          title="A catalogue backed by people who install it."
          lede="Every line we carry is hardware our engineers deploy and support in the field. Browse the catalogue, then ask us what actually fits."
        />
        <Collection kind="categories" cols={6}>
          {items.map((c) => {
            const hue = hueForIcon(c.icon, "switch");
            return (
              <Tile
                key={c.slug}
                href={`/products/${c.slug}`}
                titleAs="b"
                title={c.name}
                summary={c.description}
                padding="sm"
                hue={hue}
                icon={<IconTile name={c.icon} fallback="switch" />}
                focus={c.image_focus}
                media={c.image ? (
                  <Image
                    src={c.image}
                    alt={c.image_alt ?? ""}
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover:scale-[1.04]"
                  />
                ) : (
                  <span
                    data-tile-well
                    className="grid size-full place-items-center"
                    style={{ background: `color-mix(in srgb, ${hue} 12%, var(--color-card))` }}
                  >
                    <IconTile name={c.icon} fallback="switch" size="lg" />
                  </span>
                )}
                cta="Browse the range"
              />
            );
          })}
        </Collection>
        <div className="mt-6.5">
          <ButtonLink href="/products" variant="secondary">
            Browse full catalogue <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
