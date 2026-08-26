import "server-only";
import { publicApi } from "@/lib/api";
import type { IconName } from "@/components/icons";

/**
 * The mega-menu contents, read from the CMS rather than hard-coded, so adding
 * a solution or renaming a category updates the navigation without a deploy.
 *
 * Fetched once in the root layout and passed to the header. Everything here is
 * ISR-cached, so this costs one revalidation per window rather than a request
 * per page.
 */
export type MenuItem = { label: string; href: string; icon: IconName | null; summary?: string | null };
export type MenuSection = { key: string; items: MenuItem[]; viewAll: { label: string; href: string } };

const icon = (value: string | null): IconName | null => (value as IconName) ?? null;

export async function getMegaMenu(): Promise<Record<string, MenuSection>> {
  // A navigation failure must never take the page down — the header falls
  // back to plain top-level links, which still work.
  const empty: Record<string, MenuSection> = {};

  try {
    // `true` asks each endpoint for only what is marked for the menu. The
    // index pages call the same getters without it and still get everything --
    // being published and being in the navigation are separate decisions.
    const [solutions, categories, services, industries] = await Promise.all([
      publicApi.solutions(true).then((r) => r.data),
      publicApi.productCategories(true).then((r) => r.data),
      publicApi.services(true).then((r) => r.data),
      publicApi.industries(true).then((r) => r.data),
    ]);

    const sections: Record<string, MenuSection> = {
      "/solutions": {
        key: "/solutions",
        viewAll: { label: "All solutions", href: "/solutions" },
        items: solutions.map((s) => ({
          label: s.title, href: `/solutions/${s.slug}`, icon: icon(s.icon), summary: s.summary,
        })),
      },
      "/products": {
        key: "/products",
        viewAll: { label: "Full catalogue", href: "/products" },
        items: categories.map((c) => ({
          label: c.name, href: `/products/${c.slug}`, icon: icon(c.icon), summary: c.description,
        })),
      },
      "/services": {
        key: "/services",
        viewAll: { label: "All web services", href: "/services" },
        items: services.map((s) => ({
          label: s.title, href: `/services/${s.slug}`, icon: icon(s.icon), summary: s.summary,
        })),
      },
      "/industries": {
        key: "/industries",
        viewAll: { label: "All industries", href: "/industries" },
        items: industries.map((i) => ({
          label: i.name, href: `/industries/${i.slug}`, icon: icon(i.icon), summary: i.summary,
        })),
      },
    };

    /*
     * A section with nothing in it is dropped, not rendered empty.
     *
     * The header decides whether a top-level link opens a panel by whether a
     * section exists for it, so an editor unticking every solution would
     * otherwise get a panel containing one "All solutions" link and a lot of
     * white space. Dropped, the link behaves like About or Contact -- it just
     * navigates, which is the honest answer to "there is nothing to preview".
     */
    return Object.fromEntries(
      Object.entries(sections).filter(([, section]) => section.items.length > 0),
    );
  } catch {
    return empty;
  }
}
