"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import {
  IconArrows, IconBook, IconBox, IconBuilding, IconCert, IconChevronDown,
  IconEducation, IconGauge, IconGlobe, IconGrid, IconImage, IconLayers,
  IconLifebuoy, IconMenu, IconNetwork, IconPen, IconSearchChart, IconShop,
  IconSliders, IconTag, IconTicket, IconTools, IconUsers,
} from "@/components/icons";
import { cn } from "@/lib/utils";

type Icon = (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;

type NavLink = {
  href: string;
  label: string;
  icon: Icon;
  /** Dashboard only: without this, every /admin/* route lights it up. */
  exact?: boolean;
};

type NavItem =
  | ({ kind: "link" } & NavLink)
  | { kind: "group"; id: string; label: string; icon: Icon; links: NavLink[] };

/**
 * Seventeen destinations behind five. Only the top level is visible until a
 * section is opened, and opening one closes whichever was open before, so the
 * list never grows past five rows plus the section being used.
 *
 * The group icons are deliberately distinct from every child's — a collapsed
 * "Content" showing the same mark as the Blog row inside it reads as a
 * duplicate rather than a parent.
 */
const NAV: NavItem[] = [
  { kind: "link", href: "/admin", label: "Dashboard", icon: IconGauge, exact: true },
  { kind: "link", href: "/admin/tickets", label: "Tickets", icon: IconTicket },
  {
    kind: "group", id: "content", label: "Content", icon: IconBook,
    links: [
      { href: "/admin/blog", label: "Blog", icon: IconPen },
      { href: "/admin/knowledge-base", label: "Knowledge base", icon: IconEducation },
      { href: "/admin/case-studies", label: "Case studies", icon: IconCert },
      { href: "/admin/pages", label: "Pages", icon: IconLayers },
      { href: "/admin/faqs", label: "FAQs", icon: IconLifebuoy },
      { href: "/admin/media", label: "Media", icon: IconImage },
    ],
  },
  {
    kind: "group", id: "catalogue", label: "Catalogue", icon: IconShop,
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
    kind: "group", id: "site", label: "Site", icon: IconGlobe,
    links: [
      { href: "/admin/seo", label: "SEO", icon: IconSearchChart },
      { href: "/admin/redirects", label: "Redirects", icon: IconArrows },
      { href: "/admin/users", label: "Staff", icon: IconUsers },
      { href: "/admin/settings", label: "Settings", icon: IconSliders },
    ],
  },
];

const isOn = (pathname: string, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

/** The group holding the current route, so a deep link opens its own section. */
function groupFor(pathname: string): string | null {
  for (const item of NAV) {
    if (item.kind !== "group") continue;
    if (item.links.some((l) => isOn(pathname, l.href, l.exact))) return item.id;
  }
  return null;
}

const row =
  "flex w-full items-center gap-2 rounded px-2 py-[7px] text-[13px] font-medium " +
  "whitespace-nowrap transition-colors [&_svg]:size-4 [&_svg]:shrink-0";

export function AdminNav() {
  const pathname = usePathname();
  const base = useId();

  // One id, not a set — that *is* the accordion. Storing which section is open
  // rather than which are open makes "only one at a time" structural instead
  // of something every toggle has to remember to enforce.
  const [open, setOpen] = useState<string | null>(() => groupFor(pathname));
  const [drawer, setDrawer] = useState(false);

  // Follow the route: arriving inside a section opens it, and leaving for one
  // that belongs to no section closes what was open. Adjusting during render
  // rather than in an effect means the correct section is the first thing
  // painted, not a frame later.
  const [seen, setSeen] = useState(pathname);
  if (pathname !== seen) {
    setSeen(pathname);
    setOpen(groupFor(pathname));
    setDrawer(false);
  }

  const current =
    NAV.find((i) => i.kind === "group" && i.links.some((l) => isOn(pathname, l.href, l.exact)))
    ?? NAV.find((i) => i.kind === "link" && isOn(pathname, i.href, i.exact));
  const currentLabel = current?.label ?? "Menu";

  const links = (list: NavLink[], nested: boolean) =>
    list.map(({ href, label, icon: Icon, exact }) => {
      const active = isOn(pathname, href, exact);
      return (
        <li key={href} className="min-w-0">
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              row,
              // Indented, but still carrying its own icon: dropping the icon
              // on nested rows made the whole submenu a column of bare text
              // and lost the one thing that makes a destination recognisable
              // at a glance.
              nested && "pl-5",
              active ? "bg-brand-50 text-brand-600" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon />
            {label}
          </Link>
        </li>
      );
    });

  const tree = (
    <ul className="grid gap-0.5">
      {NAV.map((item) => {
        if (item.kind === "link") return links([item], false)[0];

        const expanded = open === item.id;
        const holdsCurrent = groupFor(pathname) === item.id;
        const panelId = `${base}-${item.id}`;

        return (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen((cur) => (cur === item.id ? null : item.id))}
              className={cn(
                row, "cursor-pointer text-left",
                // A closed section still says whether the page you are on
                // lives inside it, or the trail back is invisible.
                holdsCurrent && !expanded ? "text-brand-600" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <item.icon />
              {item.label}
              <IconChevronDown
                aria-hidden
                className={cn("ml-auto transition-transform duration-200", expanded && "rotate-180")}
              />
            </button>

            {/* hidden, not unmounted: the links stay in the DOM so the browser
                keeps them findable and nothing re-mounts on every toggle. */}
            <ul id={panelId} hidden={!expanded} className="mt-0.5 grid gap-0.5">
              {links(item.links, true)}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label="Admin sections" className="min-w-0">
      {/*
        Below lg the sidebar is a full-width block above the content, so the
        tree is behind a toggle: five collapsed rows would be 175px of nav
        before a phone showed any of the page. The button names the section
        you are in, which is the one thing a collapsed nav otherwise hides.
      */}
      <button
        type="button"
        aria-expanded={drawer}
        aria-controls={`${base}-drawer`}
        onClick={() => setDrawer((d) => !d)}
        className={cn(
          row,
          "cursor-pointer rounded border border-line-strong bg-white text-ink lg:hidden",
        )}
      >
        <IconMenu />
        {currentLabel}
        <IconChevronDown
          aria-hidden
          className={cn("ml-auto transition-transform duration-200", drawer && "rotate-180")}
        />
      </button>

      {/*
        A class, not the `hidden` attribute. Tailwind v4's preflight declares
        `[hidden] { display: none !important }`, so `lg:block` cannot win it
        back and the sidebar stayed invisible on desktop. The submenu panels
        below still use the attribute — they want exactly that behaviour and
        have no breakpoint to escape at.
      */}
      <div
        id={`${base}-drawer`}
        className={cn(
          "mt-2 lg:mt-0 lg:sticky lg:top-[68px]",
          drawer ? "block" : "hidden lg:block",
        )}
      >
        {tree}
      </div>
    </nav>
  );
}
