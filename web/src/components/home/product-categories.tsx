import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import type { ProductCategory } from "@/types/api";

export function ProductCategories({ items }: { items: ProductCategory[] }) {
  return (
    <section data-aos="fade-up" id="products" className="border-y border-line bg-surface section-y-lg">
      <Container>
        <SectionHeader
          kicker="Products"
          title="A catalogue backed by people who install it."
          lede="Every line we carry is hardware our engineers deploy and support in the field. Browse the catalogue, then ask us what actually fits."
        />
        <div className="grid gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {items.map((c) => {
            return (
              <Card key={c.slug} href={`/products/${c.slug}`} padding="none" className="group overflow-hidden">
                {/*
                  A fixed 4:3 well, so a slow image cannot shuffle the grid —
                  the same rule every other cover on this site follows, and a
                  ratio rather than a fixed height so the well stays 4:3 at
                  every column count instead of stretching wider at xl. A
                  category with no image yet falls back to its own tinted
                  icon panel rather than leaving a hole in the row.
                */}
                <span className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt={c.image_alt ?? ""}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
                      className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span
                      className="grid size-full place-items-center"
                      style={{ background: `color-mix(in srgb, ${hueForIcon(c.icon, "switch")} 12%, var(--color-card))` }}
                    >
                      <IconTile name={c.icon} fallback="switch" size="lg" />
                    </span>
                  )}
                </span>

                <span className="flex items-center gap-3 px-4 py-3.5">
                  <IconTile name={c.icon} fallback="switch" />
                  <span className="min-w-0">
                    <b className="block truncate text-14-5 font-semibold leading-tight text-ink">{c.name}</b>
                    {c.description && <span className="block truncate text-12-5 text-muted">{c.description}</span>}
                  </span>
                </span>
              </Card>
            );
          })}
        </div>
        <div className="mt-6.5">
          <ButtonLink href="/products" variant="secondary">
            Browse full catalogue <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
