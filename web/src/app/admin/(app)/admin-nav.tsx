"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconArrows, IconBook, IconBox, IconBuilding, IconCert, IconGauge, IconGrid,
  IconImage, IconLayers, IconLifebuoy, IconNetwork, IconPen, IconSearchChart,
  IconSliders, IconTag, IconTicket, IconTools, IconUsers,
} from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Grouped rather than one flat list: at seventeen entries the console needs
 * some structure, and the groups match how the roles divide — support work,
 * content, catalogue, then the administrator-only settings at the bottom.
 */
type NavLink = {
  href: string;
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  /** Dashboard only: without this, every /admin/* route lights it up. */
  exact?: boolean;
};

const groups: { label: string | null; links: NavLink[] }[] = [
  {
    label: null,
    links: [
      { href: "/admin", label: "Dashboard", icon: IconGauge, exact: true },
      { href: "/admin/tickets", label: "Tickets", icon: IconTicket },
    ],
  },
  {
    label: "Content",
    links: [
      { href: "/admin/blog", label: "Blog", icon: IconPen },
      { href: "/admin/knowledge-base", label: "Knowledge base", icon: IconBook },
      { href: "/admin/case-studies", label: "Case studies", icon: IconCert },
      { href: "/admin/pages", label: "Pages", icon: IconLayers },
      { href: "/admin/faqs", label: "FAQs", icon: IconLifebuoy },
      { href: "/admin/media", label: "Media", icon: IconImage },
    ],
  },
  {
    label: "Catalogue",
    links: [
      { href: "/admin/products", label: "Products", icon: IconBox },
      { href: "/admin/product-categories", label: "Categories", icon: IconGrid },
      { href: "/admin/brands", label: "Brands", icon: IconTag },
      { href: "/admin/solutions", label: "Solutions", icon: IconNetwork },
      { href: "/admin/services", label: "Services", icon: IconTools },
      { href: "/admin/industries", label: "Industries", icon: IconBuilding },
    ],
  },
  {
    label: "Site",
    links: [
      { href: "/admin/seo", label: "SEO", icon: IconSearchChart },
      { href: "/admin/redirects", label: "Redirects", icon: IconArrows },
      { href: "/admin/users", label: "Staff", icon: IconUsers },
      { href: "/admin/settings", label: "Settings", icon: IconSliders },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // min-w-0 on the nav is load-bearing: as a grid item it defaults to
  // min-width:auto, which refuses to shrink below the width of all the links
  // laid out in a row — so the ul's overflow-x-auto never engages and the
  // whole page gains a horizontal scrollbar on a narrow screen instead.
  return (
    <nav aria-label="Admin sections" className="min-w-0">
      <div className="grid gap-5 max-lg:flex max-lg:gap-6 max-lg:overflow-x-auto max-lg:pb-1">
        {groups.map((group) => (
          <div key={group.label ?? "top"} className="min-w-0">
            {group.label && (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[.07em] text-faint max-lg:hidden">
                {group.label}
              </p>
            )}
            <ul className="grid gap-0.5 max-lg:flex max-lg:gap-1.5">
              {group.links.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                  <li key={href} className="min-w-0">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded px-2.5 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                        "[&_svg]:size-[17px] [&_svg]:shrink-0",
                        active
                          ? "bg-brand-50 text-brand-600"
                          : "text-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
