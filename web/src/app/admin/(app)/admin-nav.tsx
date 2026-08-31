"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import {
  IconArrows, IconBook, IconBox, IconBuilding, IconCert, IconChevronDown,
  IconCamera, IconEducation, IconMail, IconGauge, IconGlobe, IconGrid, IconImage, IconLayers,
  IconLifebuoy, IconMenu, IconNetwork, IconPen, IconRack, IconSearchChart, IconShop,
  IconClock, IconSliders, IconTag, IconTeam, IconTicket, IconTools, IconUsers,
  IconClose,
} from "@/components/icons";
import { cn } from "@/lib/utils";

type Icon = (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;

/**
 * The staff roles, as the API spells them. `admin` passes every check.
 */
type RoleSlug = "support_engineer" | "content_manager" | "seo_manager" | "campaign_manager" | "store_manager" | "admin";

type NavLink = {
  href: string;
  label: string;
  icon: Icon;
  /** Dashboard only: without this, every /admin/* route lights it up. */
  exact?: boolean;
  /**
   * The role this destination's API actually requires.
   *
   * **It must match `routes/api.php`, and nothing checks that it does** —
   * these are two hand-written lists on opposite sides of the wire, which is
   * the drift this project keeps being bitten by. Wrong in one direction it
   * hides a screen somebody is entitled to use, and in the other it offers a
   * link that 403s. Omitted means everybody: `/admin/profile` is your own
   * account and every role may reach it.
   */
  role?: RoleSlug;
};

type NavItem =
  | ({ kind: "link" } & NavLink)
  | { kind: "group"; id: string; label: string; icon: Icon; links: NavLink[] };

/**
 * Where a hairline goes, and why there are only two.
 *
 * Three bands: what a support engineer works all day, the two content stores,
 * and the site's own configuration. A rule between every row would be a table;
 * a rule between every *section* would be five of them and would stop meaning
 * anything. Two says "these three groups are different kinds of thing", which
 * is the only claim worth making here.
 */
const DIVIDE_BEFORE = new Set(["content", "site"]);

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
  { kind: "link", href: "/admin", label: "Dashboard", icon: IconGauge, exact: true, role: "support_engineer" },
  { kind: "link", href: "/admin/tickets", label: "Tickets", icon: IconTicket, role: "support_engineer" },
  // Alongside Tickets rather than beside Staff: approving a registration is
  // support-desk work, and the two screens are worked in the same sitting.
  { kind: "link", href: "/admin/customers", label: "Customers", icon: IconTeam, role: "support_engineer" },
  { kind: "link", href: "/admin/applications", label: "Applications", icon: IconBook, role: "support_engineer" },
  /*
    Top level, and called Campaign rather than Newsletter.

    It sat inside Site on the grounds that a fifth section for one module was
    too much — which was right about the section and wrong about the depth. A
    campaign is not site furniture: it is a thing somebody sits down to do, on
    its own schedule, the way Tickets and Customers are. Buried one level down
    beside Sliders and Redirects it read as configuration, and the six screens
    under it were reached by nobody.
  */
  { kind: "link", href: "/admin/newsletter", label: "Campaign", icon: IconMail, role: "campaign_manager" },

  /*
    Top level, beside Campaign, for the same reason.

    The shop is a thing somebody sits down to do — prices, stock, orders — on
    its own schedule and usually by a different person from whoever writes the
    blog. Filed under Catalogue it would read as more of the marketing site,
    which is precisely the confusion the two lists being separate exists to
    avoid.
  */
  {
    kind: "group", id: "store", label: "Store", icon: IconShop,
    links: [
      { role: "store_manager", href: "/admin/store/products", label: "Products", icon: IconBox },
      { role: "store_manager", href: "/admin/store/categories", label: "Categories", icon: IconGrid },
    ],
  },
  {
    kind: "group", id: "content", label: "Content", icon: IconBook,
    links: [
      { role: "content_manager", href: "/admin/blog", label: "Blog", icon: IconPen },
      { role: "content_manager", href: "/admin/knowledge-base", label: "Knowledge base", icon: IconEducation },
      { role: "content_manager", href: "/admin/case-studies", label: "Case studies", icon: IconCert },
      { role: "content_manager", href: "/admin/pages", label: "Pages", icon: IconLayers },
      { role: "content_manager", href: "/admin/faqs", label: "FAQs", icon: IconLifebuoy },
      { role: "content_manager", href: "/admin/jobs", label: "Vacancies", icon: IconTeam },
      { role: "content_manager", href: "/admin/media", label: "Media", icon: IconImage },
    ],
  },
  {
    /*
      A rack rather than a shop front, which moved when the store arrived.

      Two groups cannot share a mark — a collapsed section is its icon and its
      word, and the same icon twice reads as a duplicate entry. Of the two, the
      shop is the one that is literally a shop; this is the hardware catalogue,
      and a rack is what it is a catalogue of.
    */
    kind: "group", id: "catalogue", label: "Catalogue", icon: IconRack,
    links: [
      { role: "content_manager", href: "/admin/products", label: "Products", icon: IconBox },
      { role: "content_manager", href: "/admin/product-categories", label: "Categories", icon: IconGrid },
      { role: "content_manager", href: "/admin/brands", label: "Brands", icon: IconTag },
      { role: "content_manager", href: "/admin/solutions", label: "Solutions", icon: IconNetwork },
      { role: "content_manager", href: "/admin/services", label: "Services", icon: IconTools },
      { role: "content_manager", href: "/admin/industries", label: "Industries", icon: IconBuilding },
    ],
  },
  {
    kind: "group", id: "site", label: "Site", icon: IconGlobe,
    links: [
      // First in Site: the navigation is the thing a visitor meets before any
      // of the rest of it.
      { role: "content_manager", href: "/admin/menus", label: "Menus", icon: IconMenu },
      { role: "content_manager", href: "/admin/sliders", label: "Sliders", icon: IconCamera },
      { role: "content_manager", href: "/admin/forms", label: "Forms", icon: IconMail },
      { role: "seo_manager", href: "/admin/seo", label: "SEO", icon: IconSearchChart },
      // Beside SEO and Redirects, not under Content: a landing page is a
      // decision about which queries the site competes for, and it is gated on
      // role:seo_manager for the same reason.
      { role: "seo_manager", href: "/admin/landing-pages", label: "Landing pages", icon: IconLayers },
      { role: "seo_manager", href: "/admin/locations", label: "Places", icon: IconGlobe },
      { role: "seo_manager", href: "/admin/redirects", label: "Redirects", icon: IconArrows },
      { role: "admin", href: "/admin/users", label: "Staff", icon: IconUsers },
      // Beside Staff: both answer questions about people rather than content.
      { role: "admin", href: "/admin/activity", label: "Activity", icon: IconClock },
      { role: "admin", href: "/admin/settings", label: "Settings", icon: IconSliders },
    ],
  },
  /*
    Your own account, at the top level rather than inside Site.

    It is reached from your name in the header, which is hidden below `sm` — at
    320px that link had truncated to a 20px ellipsis and was pushing Sign out
    off the screen, so it is not a control there in any useful sense. Without
    this entry the screen would be unreachable on a phone entirely, which is
    where somebody is most likely to be changing their own password in a hurry.

    It sat inside Site, which was harmless while everybody saw all of Site and
    became strange the moment the sidebar started filtering: a campaign manager
    reaches nothing else in that section, so they were shown a group called
    "Site" containing only their own account. It is not site configuration; it
    is the one row that belongs to no role because every role has one.
  */
  { kind: "link", href: "/admin/profile", label: "Your account", icon: IconUsers },
];

/**
 * One fluorescent hue per destination, assigned from the href.
 *
 * Deterministic, not `Math.random()`. A colour drawn at render time would
 * differ between the server and the client — a hydration mismatch — and would
 * change every time you navigated, so the one thing the colour is good for,
 * recognising a row without reading it, would be the one thing it could not
 * do. Hashing the href gives each item a stable hue that only changes if the
 * route does.
 *
 * The active row keeps `currentColor`: it is white on a brand fill, and a neon
 * icon there would sit at about 1.5:1 on it.
 */
const NEON_COUNT = 12;

function neonFor(href: string): string {
  let hash = 0;
  for (let i = 0; i < href.length; i++) hash = (hash * 31 + href.charCodeAt(i)) >>> 0;

  return `var(--color-neon-${(hash % NEON_COUNT) + 1})`;
}

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

/**
 * What this person may actually reach.
 *
 * An `admin` passes every role check on the server, so it passes every one
 * here — one rule, stated once, rather than an `admin` entry on all 24 rows.
 */
function permits(roles: string[], role?: RoleSlug): boolean {
  if (role === undefined) return true;
  if (roles.includes("admin")) return true;

  return roles.includes(role);
}

export function AdminNav({ roles = [] }: { roles?: string[] }) {
  const pathname = usePathname();
  const base = useId();

  /*
    The sidebar shows what this account can use, and nothing else.

    Before this it showed all 24 destinations to everyone, so a content manager
    was offered Settings, Staff and the activity log and got a 403 for each —
    a menu that is mostly locked doors teaches people to distrust the whole
    thing, and it hides the handful of rows they actually work in.

    Hiding is *not* the access control. `EnsureUserHasRole` is, on every route;
    this only stops the console offering what it knows will be refused. A group
    whose every child is hidden is dropped entirely rather than rendering an
    empty panel — the same rule `getMegaMenu()` follows on the public site.
  */
  const nav: NavItem[] = NAV.flatMap<NavItem>((item) => {
    if (item.kind === "link") return permits(roles, item.role) ? [item] : [];

    const links = item.links.filter((l) => permits(roles, l.role));

    return links.length === 0 ? [] : [{ ...item, links }];
  });

  // One id, not a set — that *is* the accordion. Storing which section is open
  // rather than which are open makes "only one at a time" structural instead
  // of something every toggle has to remember to enforce.
  const [open, setOpen] = useState<string | null>(() => groupFor(pathname));
  const [drawer, setDrawer] = useState(false);
  const [filter, setFilter] = useState("");

  const term = filter.trim().toLowerCase();

  // Follow the route: arriving inside a section opens it, and leaving for one
  // that belongs to no section closes what was open. Adjusting during render
  // rather than in an effect means the correct section is the first thing
  // painted, not a frame later.
  const [seen, setSeen] = useState(pathname);
  if (pathname !== seen) {
    setSeen(pathname);
    setOpen(groupFor(pathname));
    setDrawer(false);
    // A filter that survives the navigation it caused leaves the sidebar
    // showing one row and no way back that looks like one.
    setFilter("");
  }

  const current =
    nav.find((i) => i.kind === "group" && i.links.some((l) => isOn(pathname, l.href, l.exact)))
    ?? nav.find((i) => i.kind === "link" && isOn(pathname, i.href, i.exact));
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
              // Solid, not a tint. bg-brand-50 was a barely-there wash that
              // read as "slightly warmer row" rather than "you are here" —
              // in a list of seventeen near-identical rows the current one
              // has to be the first thing the eye lands on. White on
              // brand-600 measures 7.5:1, so the fill can be this strong
              // without costing legibility.
              active
                ? "bg-brand-600 font-semibold text-white shadow-1"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon style={active ? undefined : { color: neonFor(href) }} />
            {label}
          </Link>
        </li>
      );
    });

  /*
   * Filtering flattens. Twenty-five destinations behind five collapsed
   * sections means the search that finds one has to *show* it, and showing it
   * inside its accordion would mean opening several at once — which is the one
   * thing the accordion exists to prevent. So a term switches the tree for a
   * plain list of what matched, and clearing it puts the tree back.
   *
   * Matched against the section name too: somebody who types "catalogue" is
   * asking for what is in it.
   */
  const matches: NavLink[] = term === ""
    ? []
    : nav.flatMap((item) =>
      item.kind === "link"
        ? (item.label.toLowerCase().includes(term) ? [item] : [])
        : item.links.filter(
          (l) => l.label.toLowerCase().includes(term) || item.label.toLowerCase().includes(term),
        ),
    );

  const tree = term !== "" ? (
    matches.length === 0 ? (
      <p className="px-2 py-3 text-[12.5px] text-muted">
        Nothing matches “{filter.trim()}”.
      </p>
    ) : (
      <ul className="grid gap-0.5">{links(matches, false)}</ul>
    )
  ) : (
    <ul className="grid gap-0.5">
      {nav.map((item) => {
        if (item.kind === "link") return links([item], false)[0];

        const expanded = open === item.id;
        const holdsCurrent = groupFor(pathname) === item.id;
        const panelId = `${base}-${item.id}`;

        return (
          <li key={item.id} className="min-w-0">
            {/* A hairline, and nothing a screen reader has to hear about —
                the grouping it draws is already carried by the sections
                themselves. Inset by the row padding so it lines up with the
                text rather than the panel edge. */}
            {DIVIDE_BEFORE.has(item.id) && (
              <hr aria-hidden className="mx-2 my-2 border-0 border-t border-line" />
            )}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen((cur) => (cur === item.id ? null : item.id))}
              className={cn(
                row, "cursor-pointer text-left",
                // The section holding the current page stays marked whether
                // it is open or shut. Open, it is the heading above a
                // highlighted row; shut, it is the only thing saying where
                // the page you are on actually lives.
                holdsCurrent
                  ? "bg-brand-50 font-semibold text-brand-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {/* The section headers get a hue too, keyed on the section id.
                  Their row is a tint rather than a solid fill even when it
                  holds the current page, so the icon stays legible on it. */}
              <item.icon style={{ color: neonFor(item.id) }} />
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
    /*
      The rule dividing the sidebar from the page, and `lg:` on every part of
      it. Below that breakpoint the nav is a full-width block *above* the
      content, where a right-hand border is a stray line ending in mid-air.

      It goes on <nav> rather than on the sticky panel inside it: the panel is
      only as tall as the tree, so the line would stop after Settings and leave
      the rest of a long page undivided. As a grid item this element stretches
      to the row, so the rule runs the height of whichever column is taller.
    */
    <nav
      aria-label="Admin sections"
      className="min-w-0 lg:border-r lg:border-line lg:pr-5"
    >
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
          "cursor-pointer rounded border border-line-strong bg-card text-ink lg:hidden",
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
        {/*
          A type-to-find over the sidebar.

          Twenty-five destinations sit behind five collapsed sections, so
          reaching Redirects is "guess which section, open it, read seven
          rows". Typing three letters is faster than remembering somebody
          else's taxonomy, and this is a tool used at a desk for hours by
          people who learn keystrokes.

          `type="search"` for the browser's own clear affordance, plus an
          explicit button because WebKit's is the only one that renders and
          it is not keyboard reachable. Escape clears it too, which is what
          the fingers already in the field will try first.
        */}
        <div className="relative mb-2">
          <label htmlFor={`${base}-filter`} className="sr-only">Filter sections</label>
          <input
            id={`${base}-filter`}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
            placeholder="Filter…"
            autoComplete="off"
            className={cn(
              "w-full rounded border border-line-strong bg-card py-[6px] pr-7 pl-2.5 text-[13px]",
              "text-ink transition-all duration-200 ease-brand placeholder:text-faint",
              "focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none",
              "[&::-webkit-search-cancel-button]:hidden",
            )}
          />
          {filter !== "" && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear the filter"
              className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded text-faint transition-colors hover:text-ink [&_svg]:size-3.5"
            >
              <IconClose />
            </button>
          )}
        </div>

        {tree}
      </div>
    </nav>
  );
}
