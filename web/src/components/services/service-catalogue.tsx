import Image from "next/image";
import { Collection, Tile } from "@/components/ui/collection";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import type { Service, ServiceCategory } from "@/types/api";
import { groupServices, type ServiceGroup } from "@/lib/service-groups";
import { ServiceTabs } from "./service-tabs";
import { blurProps } from "@/lib/blur";

/**
 * Every published service, grouped by service category (the client,
 * 2026-09-29): the homepage's Services section in every theme, and /services.
 *
 * - **Groups follow the categories' order** (`groupServices()` in
 *   `lib/service-groups.ts`, the mega menu's rule too): a category with no
 *   published service is left out, and the services filed under none — or
 *   under a category since switched off — come last as "Other services".
 * - **One group is a plain `Collection`**; two or more are `ServiceTabs`, one
 *   tab per group, every panel rendered here on the server.
 * - **Each group is a `Collection kind="services"`**, so every theme's idiom
 *   draws it. A tile carries its picture as the media well when it has one.
 * - **`image_background`** stamps `data-tile-bg` on the category's collection,
 *   and the shared rule in `globals.css` turns each tile with a picture into
 *   the picture itself, the words over an opaque `--color-scrim` foot.
 *
 * `fill` is the homepage's: a selection never ends on a half-empty row
 * (`FullRows`), measured per panel when it is shown. An index never fills.
 */
// The grouping is one rule shared with the mega menu's Services panel.
export { groupServices, type ServiceGroup } from "@/lib/service-groups";

export function ServiceCatalogue({
  services, categories, fill = false, titleAs = "h3", tabsLabel = "Service categories",
}: {
  services: Service[];
  categories: ServiceCategory[];
  fill?: boolean;
  /** `h3` under a section's `h2` (the homepage), `h2` straight under a page's `h1` (/services). */
  titleAs?: "h2" | "h3";
  tabsLabel?: string;
}) {
  const groups = groupServices(services, categories);
  if (groups.length === 0) return null;

  const grid = (g: ServiceGroup) => (
    <Collection fill={fill} kind="services" cols={3} data-tile-bg={g.background ? "" : undefined} data-service-group={g.slug}>
      {g.items.map((s) => (
        <Tile
          key={s.id}
          href={`/services/${s.slug}`}
          titleAs={titleAs}
          title={s.title}
          summary={s.summary}
          icon={<IconTile name={s.icon} fallback="globe" />}
          hue={hueForIcon(s.icon, "globe")}
          focus={s.image_focus}
          media={s.image ? (
            <Image {...blurProps(s.image_blur)}
              src={s.image}
              // The title under it names the service; the picture's own words are for when it stands alone.
              alt={s.image_alt ?? ""}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover:scale-[1.04]"
            />
          ) : undefined}
          meta={s.highlights?.length ? (
            // The service's highlights as chips — the `note` the static grid
            // carried, now the editor's. They take the meta's ink, so they
            // read on a card and on a picture card alike.
            <ul data-tile-tags aria-label="Highlights" className="flex flex-wrap gap-1.5">
              {s.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          ) : undefined}
          cta="Learn more"
        />
      ))}
    </Collection>
  );

  if (groups.length === 1) return grid(groups[0]);

  return (
    <ServiceTabs
      label={tabsLabel}
      groups={groups.map((g) => ({
        slug: g.slug,
        label: g.name,
        panel: (
          <>
            {g.description && <p className="measure mb-6 text-14-5 leading-relaxed text-muted">{g.description}</p>}
            {grid(g)}
          </>
        ),
      }))}
    />
  );
}
