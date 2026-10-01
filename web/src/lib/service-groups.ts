import type { Service, ServiceCategory } from "@/types/api";

/**
 * The services grouped by service category — one rule for the Services
 * section's tabs (`components/services/service-catalogue.tsx`) and the mega
 * menu's Services panel (`lib/navigation.ts`), so the header and the page
 * never disagree about what belongs where.
 *
 * Groups follow the categories' order. The API sends active categories only;
 * a category with no service in the list is left out, and the services filed
 * under none — or under a category since switched off — come last as "Other
 * services". A pure function in a directive-less module, because both a
 * server-rendered component and the navigation loader call it.
 */
export type ServiceGroup = {
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  background: boolean;
  items: Service[];
};

export const OTHER_SERVICES = "other-services";

export function groupServices(services: Service[], categories: ServiceCategory[]): ServiceGroup[] {
  const groups: ServiceGroup[] = categories.map((c) => ({
    slug: c.slug, name: c.name, description: c.description, icon: c.icon ?? null,
    background: Boolean(c.image_background), items: [],
  }));
  const bySlug = new Map(groups.map((g) => [g.slug, g]));
  const other: ServiceGroup = { slug: OTHER_SERVICES, name: "Other services", description: null, icon: null, background: false, items: [] };

  for (const s of services) {
    const home = s.category ? bySlug.get(s.category.slug) : undefined;
    (home ?? other).items.push(s);
  }

  // A slug the editor chose may already be "other-services"; the leftovers then join it.
  const named = bySlug.get(OTHER_SERVICES);
  if (named) { named.items.push(...other.items); other.items = []; }

  return [...groups, other].filter((g) => g.items.length > 0);
}
