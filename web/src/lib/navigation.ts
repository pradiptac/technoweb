import "server-only";
import { publicApi } from "@/lib/api";
import type { IconName } from "@/components/icons";
import type { NavNode } from "@/types/api";

/**
 * The mega-menu contents, read from the CMS rather than hard-coded, so adding
 * a solution or renaming a category updates the navigation without a deploy.
 *
 * Fetched once in the root layout and passed to the header. Everything here is
 * ISR-cached, so this costs one revalidation per window rather than a request
 * per page.
 */
/**
 * One entry in a mega panel or a footer column, and whatever hangs under it.
 *
 * `children` is recursive because a menu nests without limit now. It used to
 * stop at two levels, and the reason given was that neither location rendered a
 * third — which was true, and was the argument for teaching them to rather than
 * for keeping the cap. An empty array is the ordinary case: the CMS-driven
 * fallback below is two levels by construction.
 */
export type MenuItem = {
  label: string;
  href: string;
  icon: IconName | null;
  summary?: string | null;
  /*
   * Optional, so the CMS-driven fallback below satisfies the type without
   * every entry gaining an empty array it does not need: solutions, categories,
   * services and industries are two levels by construction and have no deeper
   * structure to carry.
   */
  children?: MenuItem[];
};
export type MenuSection = { key: string; items: MenuItem[]; viewAll: { label: string; href: string } };

const icon = (value: string | null): IconName | null => (value as IconName) ?? null;

/**
 * A `NavNode` from the API as a `MenuItem`, all the way down.
 *
 * Recursive rather than one level of `.map`, which is the whole change: the
 * previous version read `node.children` and dropped everything under it, so a
 * third level was fetched, sent, and silently thrown away here.
 */
function toItem(node: NavNode): MenuItem {
  return {
    label: node.label,
    href: node.href,
    icon: icon(node.icon),
    summary: node.summary,
    children: node.children.map(toItem),
  };
}

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

/**
 * The primary navigation: a configured menu if one is assigned, otherwise the
 * built-in one.
 *
 * **The fallback is the point.** `/menus/primary` answers 404 when nothing is
 * assigned, and this returns null for that — so the header keeps `mainNav` and
 * the CMS-driven mega panels exactly as they are. Switching to a custom menu
 * becomes an editorial act rather than a deploy, and an install that never
 * opens that screen is unaffected. It is the same shape as the homepage hero,
 * where an absent slider leaves the NOC panel in place rather than a gap.
 *
 * A configured menu is reshaped into the structures the header already
 * renders — a list of links, plus a `MenuSection` per link that has children —
 * so `MegaMenu` and the mobile drawer need no second code path. Two renderers
 * for one bar is how they drift.
 */
/**
 * A footer link, and whatever nests under it.
 *
 * `children` is optional so the built-in navigation in `content/site.ts` — a
 * flat list of links, which is all it has ever been — still satisfies the type
 * without every entry gaining an empty array it does not need.
 */
export type NavLink = { label: string; href: string; newTab: boolean; children?: NavLink[] };

export async function getPrimaryNav(): Promise<{
  links: NavLink[];
  sections: Record<string, MenuSection>;
} | null> {
  let nodes: NavNode[];

  try {
    nodes = (await publicApi.menu("primary")).data;
  } catch {
    // 404 (nothing assigned) and a network failure land here alike, and both
    // want the same answer: use the navigation built into the site. A menu
    // that cannot be fetched must never mean a header with no links in it.
    return null;
  }

  // An assigned but empty menu is a real instruction — somebody emptied it —
  // but a header with nothing in it is indistinguishable from a broken site,
  // so the built-in navigation still stands in.
  if (nodes.length === 0) return null;

  const sections: Record<string, MenuSection> = {};

  for (const node of nodes) {
    if (node.children.length === 0) continue;

    sections[node.href] = {
      key: node.href,
      // The parent doubles as the panel's "view all", which is what it means:
      // the top-level link is where the section index lives.
      viewAll: { label: `All ${node.label.toLowerCase()}`, href: node.href },
      items: node.children.map(toItem),
    };
  }

  return {
    links: nodes.map((node) => ({ label: node.label, href: node.href, newTab: node.new_tab })),
    sections,
  };
}

/**
 * A node as a footer link, with whatever sits under it.
 *
 * The footer nests too — a column can hold a group with its own entries — so
 * this recurses for the reason `toItem` does.
 */
function toLink(node: NavNode): NavLink {
  return {
    label: node.label,
    href: node.href,
    newTab: node.new_tab,
    children: node.children.map(toLink),
  };
}

/** The footer's columns, or null to keep the built-in ones. */
export async function getFooterNav(): Promise<{ heading: string; href: string; links: NavLink[] }[] | null> {
  try {
    const { data } = await publicApi.menu("footer");
    if (data.length === 0) return null;

    return data.map((node) => ({
      heading: node.label,
      href: node.href,
      links: node.children.map(toLink),
    }));
  } catch {
    return null;
  }
}
