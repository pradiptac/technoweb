import type { ReactNode } from "react";
import { FIELD_ORDER, GROUP_TITLES, HIDDEN, LABELS, SCREENS } from "./settings/settings-copy";
import { bestRow } from "./nav-match";
import {
  IconAlert,
  IconArrows, IconBook, IconBox, IconBuilding, IconCert, IconChart,   IconCamera, IconEducation, IconMail, IconGauge, IconGlobe, IconGrid, IconImage, IconLayers,
  IconLifebuoy, IconMenu, IconNetwork, IconPen, IconRack, IconSearchChart, IconShop,
  IconClock, IconHeadset, IconMegaphone, IconSliders, IconTag, IconTeam, IconTicket, IconTools, IconUsers,
  IconWrench, IconNewspaper, IconBriefcase, IconShield, IconPlug, IconChat, IconBackup, IconCloud, IconMeeting,
  IconProjector,
} from "@/components/icons";

/**
 * The console's sidebar, as data. Rendered by `admin-nav.tsx`, which is a
 * client component and imports **nothing** from `@/components/icons`: the
 * server layout calls `navFor()` here, which resolves each row's icon to an
 * element and drops what the account's roles cannot reach, and hands the
 * client the result. That is what keeps the ~130-glyph map out of the console
 * bundle — the same trick `lib/navigation.ts` plays for the public header —
 * and it is why this file exists apart from the component.
 *
 * `AdminNavRolesTest` (api/tests) reads the `href:`/`role:` pairs out of this
 * file by regex and compares them with the route table; keep both spellings
 * on one line per row.
 */

type Icon = (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;

/**
 * The staff roles, as the API spells them. `admin` passes every check.
 */
export type RoleSlug = "support_engineer" | "content_manager" | "seo_manager" | "campaign_manager" | "store_manager" | "sales_manager" | "meeting_host" | "admin";

/**
 * A row reachable by either of two roles, spelled the way the route's
 * middleware spells it (`role:campaign_manager,store_manager`), so
 * `AdminNavRolesTest` compares the two strings as they are. Messaging is the
 * first: its templates, automations and broadcasts are worked by both desks.
 */
export type RoleGate = RoleSlug | `${RoleSlug},${RoleSlug}`;

export type NavLink = {
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
  role?: RoleGate;
};

export type NavItem =
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
export const NAV: NavItem[] = [
  { kind: "link", href: "/admin", label: "Dashboard", icon: IconGauge, exact: true, role: "support_engineer" },
  /*
    Tickets, Customers, Leads and Campaign were single links until 2026-09-20
    and are groups now, each ending in the settings its module owns — the
    client's rule that Settings holds only what the whole console shares.
    A role that can open one row still gets one link: `navFor` flattens a
    group with a single visible child, so a support engineer's sidebar is
    unchanged. An administrator gets the group, and the "new since" count a
    collapsed group hides is summed onto its header (admin-nav.tsx).
  */
  {
    kind: "group", id: "tickets", label: "Tickets", icon: IconTicket,
    links: [
      { role: "support_engineer", href: "/admin/tickets", label: "Tickets", icon: IconLifebuoy },
      { role: "admin", href: "/admin/tickets/settings", label: "Email to ticket", icon: IconSliders },
    ],
  },
  // Alongside Tickets rather than beside Staff: approving a registration is
  // support-desk work, and the two screens are worked in the same sitting.
  {
    kind: "group", id: "customers", label: "Customers", icon: IconTeam,
    links: [
      { role: "support_engineer", href: "/admin/customers", label: "Customers", icon: IconUsers },
      { role: "admin", href: "/admin/customers/settings", label: "Portal", icon: IconSliders },
    ],
  },
  /*
    Top level, beside Tickets and Customers, because it is the same *kind* of
    thing: a queue somebody opens every morning and works down.

    Its own role rather than `support_engineer`, though on a small desk the
    same person holds both. Support answers people who have already bought;
    this is everybody who has not, with their telephone numbers — and the day
    those become two people is the day a conflated role has to be split with
    the permission already granted to everyone who had the other job.
  */
  {
    kind: "group", id: "leads", label: "Leads", icon: IconChart,
    links: [
      { role: "sales_manager", href: "/admin/leads", label: "Leads", icon: IconSearchChart },
      { role: "admin", href: "/admin/leads/settings", label: "Scoring", icon: IconSliders },
    ],
  },
  /*
    Engineer visits (2026-09-26, docs/visits.md), beside Leads: a queue both
    the sales desk and the support desk work — a site survey starts a sale
    and scopes an installation — so the row carries both roles, spelled the
    way the route's middleware spells them.
  */
  {
    kind: "group", id: "visits", label: "Visits", icon: IconBuilding,
    links: [
      { role: "sales_manager,support_engineer", href: "/admin/visits", label: "Visits", icon: IconClock },
      { role: "admin", href: "/admin/visits/settings", label: "Visit settings", icon: IconSliders },
    ],
  },
  /*
    Online meetings (2026-09-29, docs/meetings.md), beside Visits: the same
    two desks work the list, so its row carries both roles as the route
    middleware spells them. Types are the sales manager's; the hosts' hours
    and the settings (with the Google connection) are an administrator's.
    "My meetings" is a host's own diary — the one row a `meeting_host` with
    no other role sees, which `navFor` flattens to a plain link. Never
    `exact` on Meetings: its detail pages resolve to it by the longest match.
  */
  {
    kind: "group", id: "meetings", label: "Meetings", icon: IconMeeting,
    links: [
      { role: "sales_manager,support_engineer", href: "/admin/meetings", label: "Meetings", icon: IconClock },
      { role: "sales_manager", href: "/admin/meetings/types", label: "Meeting types", icon: IconGrid },
      { role: "admin", href: "/admin/meetings/hosts", label: "Hosts", icon: IconUsers },
      { role: "meeting_host", href: "/admin/my-meetings", label: "My meetings", icon: IconHeadset },
      { role: "admin", href: "/admin/meetings/settings", label: "Settings", icon: IconSliders },
    ],
  },
  /*
    Top level, and called Campaign rather than Newsletter.

    It sat inside Site on the grounds that a fifth section for one module was
    too much — which was right about the section and wrong about the depth. A
    campaign is not site furniture: it is a thing somebody sits down to do, on
    its own schedule, the way Tickets and Customers are. Buried one level down
    beside Sliders and Redirects it read as configuration, and the six screens
    under it were reached by nobody.
  */
  {
    kind: "group", id: "newsletter", label: "Campaign", icon: IconMail,
    links: [
      { role: "campaign_manager", href: "/admin/newsletter", label: "Campaign", icon: IconMegaphone },
      { role: "admin", href: "/admin/newsletter/settings", label: "Settings", icon: IconSliders },
    ],
  },

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
      /*
        Orders first. It is the screen somebody opens every morning; products
        are edited when something changes, which is far less often — the same
        ordering argument Tickets makes against the CMS entries below it.
      */
      // `exact`, because "/admin/store" is a prefix of every other row in this
      // group — without it the overview reads as active on all of them, which is
      // the same reason the dashboard at "/admin" carries the flag.
      { role: "store_manager", href: "/admin/store", label: "Overview", icon: IconChart, exact: true },
      { role: "store_manager", href: "/admin/store/orders", label: "Orders", icon: IconTicket },
      { role: "store_manager", href: "/admin/store/products", label: "Products", icon: IconBox },
      { role: "store_manager", href: "/admin/store/categories", label: "Categories", icon: IconGrid },
      { role: "store_manager", href: "/admin/store/coupons", label: "Discount codes", icon: IconTag },
      // Product reviews: the queue opens on what is waiting (docs/store.md, "Reviews").
      { role: "store_manager", href: "/admin/store/reviews", label: "Reviews", icon: IconChat },
      // The shop front's promo band: eight settings rows behind a store-manager
      // endpoint of their own, so the person running a promotion does not
      // need Settings — which they cannot open. The info bar's shape.
      { role: "store_manager", href: "/admin/store/promo", label: "Promo banners", icon: IconMegaphone },
      { role: "store_manager", href: "/admin/store/stock", label: "Stock", icon: IconBox },
      { role: "store_manager", href: "/admin/store/reports", label: "Reports", icon: IconSearchChart },
      { role: "admin", href: "/admin/store/settings", label: "Settings", icon: IconSliders },
    ],
  },
  {
    /*
      WhatsApp, RCS and browser push (Phase 2): what is said on each channel,
      which event says it, one-off broadcasts, and who agreed to be messaged.
      Top level beside Campaign and Store because both desks work it — the
      one section gated on two roles at once — and its settings (the provider
      keys) are the administrator's, like every module's.
    */
    kind: "group", id: "messaging", label: "Messaging", icon: IconChat,
    links: [
      { role: "campaign_manager,store_manager", href: "/admin/messaging/templates", label: "Templates", icon: IconPen },
      { role: "campaign_manager,store_manager", href: "/admin/messaging/automations", label: "Automations", icon: IconSliders },
      { role: "campaign_manager,store_manager", href: "/admin/messaging/broadcasts", label: "Broadcasts", icon: IconMegaphone },
      { role: "campaign_manager,store_manager", href: "/admin/messaging/contacts", label: "Contacts", icon: IconUsers },
      { role: "admin", href: "/admin/messaging/settings", label: "Settings", icon: IconSliders },
    ],
  },
  {
    /*
     * The website assistant, top level rather than inside Site.
     *
     * The same argument the newsletter made: it is something somebody sits
     * down to do — reading what visitors asked and writing the pages the site
     * is missing — on its own schedule, and buried beside Sliders and
     * Redirects it would read as configuration.
     */
    kind: "group", id: "chat", label: "Assistant", icon: IconHeadset,
    links: [
      { role: "admin", href: "/admin/chat", label: "Overview", icon: IconChart, exact: true },
      { role: "admin", href: "/admin/chat/unanswered", label: "Unanswered", icon: IconSearchChart },
      { role: "admin", href: "/admin/chat/conversations", label: "Conversations", icon: IconTicket },
      { role: "admin", href: "/admin/chat/settings", label: "Settings", icon: IconSliders },
    ],
  },
  {
    /*
      The blog's own section: the articles, the taxonomy they are filed under,
      and the queue of what readers have written back.

      All three are `content_manager`, so nobody ever sees a one-row version of
      this — the trap a "Careers" section genuinely does have, below. It takes
      three rows out of a Content group that held nine, and the three were a
      third of it spent on one subject.

      **The cost is a click, and it is smaller than it looks.** Blog is the
      most-opened screen in the console for whoever lives in this section, and
      an accordion adds a press to reaching it from elsewhere — but `groupFor`
      opens the section holding the current route, so arriving anywhere in the
      blog opens all three, and moving between them costs nothing at all. The
      press is paid once on the way in, and the filter box above the list is
      the other way there.
    */
    kind: "group", id: "blog", label: "Blog", icon: IconNewspaper,
    links: [
      { role: "content_manager", href: "/admin/blog", label: "Blog", icon: IconPen },
      { role: "content_manager", href: "/admin/blog-categories", label: "Blog categories", icon: IconTag },
      /*
        The moderation queue. `content_manager`, because comments are published
        on the blog beside the articles the same person wrote — deciding what
        appears there is the same job.

        It is the one row here that is a *queue* rather than authoring, and
        every other queue in this console — Tickets, Customers, Applications,
        Leads — is top level. It stays beside the articles anyway: a moderator's
        journey is the blog *and* its comments, and splitting those across two
        places costs more than the inconsistency does.
      */
      { role: "content_manager", href: "/admin/blog-comments", label: "Comments", icon: IconHeadset },
      { role: "admin", href: "/admin/blog/settings", label: "Settings", icon: IconSliders },
    ],
  },
  {
    /*
      Events (0.118.0, docs/events.md), beside Blog: something with a date
      that people attend — a seminar, a webinar, a stand at a trade show —
      written by the same person who writes the blog, so its row is a
      `content_manager`'s. The settings (where registrations are emailed, the
      reminder, the default seats) are an administrator's, the rule every
      module's own settings follow. Never `exact` on Events: the edit form
      resolves to it by the longest match.

      An event's registrations (`/admin/events/{id}/registrations`) are worked
      by the sales desk as well, and need no row — they are reached from the
      event, the notification email and the lead. Their gate is
      `SCREEN_GATES` below, since no row's path can name a screen that sits
      under an id.
    */
    kind: "group", id: "events", label: "Events", icon: IconProjector,
    links: [
      { role: "content_manager", href: "/admin/events", label: "Events", icon: IconClock },
      { role: "admin", href: "/admin/events/settings", label: "Settings", icon: IconSliders },
    ],
  },
  {
    kind: "group", id: "content", label: "Content", icon: IconBook,
    links: [
      { role: "content_manager", href: "/admin/knowledge-base", label: "Knowledge base", icon: IconEducation },
      { role: "content_manager", href: "/admin/case-studies", label: "Case studies", icon: IconCert },
      { role: "content_manager", href: "/admin/pages", label: "Pages", icon: IconLayers },
      // Saved sections and page templates (docs/page-builder.md "The library").
      { role: "content_manager", href: "/admin/pages/library", label: "Section library", icon: IconBox },
      { role: "content_manager", href: "/admin/faqs", label: "FAQs", icon: IconLifebuoy },
      { role: "content_manager", href: "/admin/media", label: "Media", icon: IconImage },
      { role: "admin", href: "/admin/media/settings", label: "Media settings", icon: IconSliders },
      // The company profile. `IconShield` rather than `IconCert`, which Case
      // studies already wears in this group — two rows, one mark, reads as a
      // duplicate entry.
      { role: "content_manager", href: "/admin/team-members", label: "Team", icon: IconUsers },
      { role: "content_manager", href: "/admin/clients", label: "Clients", icon: IconBuilding },
      { role: "content_manager", href: "/admin/certifications", label: "Certifications", icon: IconShield },
      // Custom fields (docs/custom-content.md): extra fields on the records above.
      { role: "content_manager", href: "/admin/custom-fields", label: "Custom fields", icon: IconWrench },
      /*
        Custom content types: one row for the types and one for their
        entries, however many types there are. `/admin/content/{type}/…`
        resolves to "Custom content" by the longest-match rule, so every
        entry screen keeps its role gate without a row per type.
      */
      { role: "content_manager", href: "/admin/content-types", label: "Content types", icon: IconGrid },
      { role: "content_manager", href: "/admin/content", label: "Custom content", icon: IconPen },
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
      { role: "content_manager", href: "/admin/product-categories", label: "Product categories", icon: IconGrid },
      { role: "content_manager", href: "/admin/brands", label: "Brands", icon: IconTag },
      { role: "content_manager", href: "/admin/solutions", label: "Solutions", icon: IconNetwork },
      { role: "content_manager", href: "/admin/services", label: "Services", icon: IconTools },
      { role: "content_manager", href: "/admin/service-categories", label: "Service categories", icon: IconLayers },
      { role: "content_manager", href: "/admin/industries", label: "Industries", icon: IconBuilding },
    ],
  },
  {
    /*
      Both halves of hiring, which were the two furthest-apart rows in the
      sidebar: the vacancy was the eighth of nine rows inside Content, and the
      applications it receives were at the top level three sections above it.
      They are one piece of work — you post a role, then you read what arrives
      against it — and the screens have always known that, linking to each
      other in both directions.

      **It is a two-role section, and that has a cost worth stating.** The two
      are gated apart deliberately — a CV and an employment history have no
      business with whoever edits the blog — so a `content_manager` sees a
      Careers section holding only Vacancies and a `support_engineer` sees one
      holding only Applications. A section containing a single row is a press
      to reach one destination, which is the exact complaint recorded above
      about "Your account" living inside "Site".

      Only an administrator sees both, and it is worth it there: those two rows
      were the sidebar's worst separation. Nothing about the roles changed, so
      `AdminNavRolesTest` still holds — the alternative, giving both rows one
      role, is an API change and a decision about who may read a CV rather than
      a decision about a menu.
    */
    kind: "group", id: "careers", label: "Careers", icon: IconBriefcase,
    links: [
      { role: "content_manager", href: "/admin/jobs", label: "Vacancies", icon: IconTeam },
      // The queue half, and the reason it is no longer top level. It kept its
      // own role: approving a registration and reading an application are both
      // support-desk work here, on a desk where one person holds both.
      { role: "support_engineer", href: "/admin/applications", label: "Applications", icon: IconBook },
    ],
  },
  {
    /*
      Site is the page furniture an editor arranges, and it is now *only* that.

      It used to carry fourteen rows across three roles — these five, the four
      SEO ones and the five administrative ones — which made it both the
      longest section in the sidebar and the only one that mixed roles. Those
      two facts were the same fact. A heading standing for three unrelated jobs
      cannot be ordered sensibly, because there is no order: Menus above SEO
      above Staff is three lists concatenated, and whichever row you want is
      somewhere in the middle of somebody else's work.

      Measured in a browser rather than assumed, because the role filter makes
      the two halves of this fail differently. **An administrator holds every
      role and saw all fourteen** — one word over the whole of the site's
      furniture, its search strategy and the install's own configuration, which
      is the section nobody could scan. A single-role holder was already shown
      only their own rows, so for them nothing was long; what was wrong was the
      *heading*, because a redirect and a landing page are not "Site" in any
      sense a person would mean it.

      Split on the role, both complaints go: an administrator gets three
      sections of five, four and five, and every heading names the work under
      it. Nothing left the console and **no row changed the role it is gated
      on** — `AdminNavRolesTest` still checks that against `routes/api.php`,
      and the sidebar drops a group whose every child is hidden, so a content
      manager is shown Content, Catalogue and Site and no empty headings.
    */
    kind: "group", id: "site", label: "Site", icon: IconGlobe,
    links: [
      // First in Site: the navigation is the thing a visitor meets before any
      // of the rest of it.
      { role: "content_manager", href: "/admin/menus", label: "Menus", icon: IconMenu },
      { role: "content_manager", href: "/admin/sliders", label: "Sliders", icon: IconCamera },
      { role: "content_manager", href: "/admin/galleries", label: "Galleries", icon: IconImage },
      { role: "content_manager", href: "/admin/popups", label: "Popups", icon: IconLayers },
      /*
        Content blocks (2026-09-24): one entity, four rows, the kind in the
        path so each row matches its own list, form and preview — and the
        role gate finds a row for every one of those screens.
      */
      { role: "content_manager", href: "/admin/blocks/cta", label: "CTA banners", icon: IconMegaphone },
      { role: "content_manager", href: "/admin/blocks/stats", label: "Stat bars", icon: IconChart },
      { role: "content_manager", href: "/admin/blocks/pricing", label: "Pricing", icon: IconGrid },
      { role: "content_manager", href: "/admin/blocks/stack", label: "Technology stack", icon: IconLayers },
      /*
        The announcement strip, at the client's request beside Popups — it
        is a thing on the site rather than a setting, whatever table it
        lives in. A deep link into the settings screen's own tab, and the
        one row here whose href carries a query: `isOn` compares pathnames,
        so the Settings row (exact) is the one that lights up while it is
        open, which is where the person is. `role:admin`, because the
        settings endpoint is.
      */
      { role: "admin", href: "/admin/info-bar", label: "Info bar", icon: IconMegaphone },
      { role: "admin", href: "/admin/themes", label: "Themes", icon: IconLayers },
      { role: "admin", href: "/admin/site/settings", label: "Settings", icon: IconSliders },
      { role: "content_manager", href: "/admin/forms", label: "Forms", icon: IconMail },
    ],
  },
  {
    /*
      Everything gated on `role:seo_manager`, and that role is the argument for
      the section existing rather than these four sitting under Content: a
      landing page, a redirect and a place are not content. They are decisions
      about which queries the site competes for, and getting one wrong costs
      the ranking of pages nobody touched — which is why the same role owns the
      redirect table and the doorway-page gate.

      The first row is "Overview" rather than "SEO", the way Store and
      Assistant already name theirs: a row repeating its own section's name
      says nothing, and "SEO › SEO" reads as a mistake in the menu. Its href is
      unchanged, so every link into it still resolves.
    */
    kind: "group", id: "seo", label: "SEO", icon: IconSearchChart,
    links: [
      { role: "seo_manager", href: "/admin/seo", label: "Overview", icon: IconChart },
      { role: "seo_manager", href: "/admin/landing-pages", label: "Landing pages", icon: IconLayers },
      { role: "seo_manager", href: "/admin/locations", label: "Places", icon: IconGlobe },
      { role: "seo_manager", href: "/admin/redirects", label: "Redirects", icon: IconArrows },
      { role: "admin", href: "/admin/seo/settings", label: "Settings", icon: IconSliders },
    ],
  },
  {
    /*
      What the install *is*, rather than what it says — and the one section an
      editor never opens, which is why it sits last.

      Configuration leads, because it is what somebody comes here to change;
      the three below it answer "who did what, and what broke". Both halves are
      `role:admin` already, so this is one group rather than two.

      `IconWrench` rather than the `IconSliders` on Settings inside it. Two
      groups cannot share a mark — a collapsed section is its icon and its word
      — and a group wearing the mark of a row it contains is the same problem
      one level down.
    */
    kind: "group", id: "system", label: "System", icon: IconWrench,
    links: [
      /*
        `exact`, because `/admin/settings` is a prefix of its sibling below:
        without it Settings reads as active while you are on the templates
        screen. The same rule Discount codes and Reports forced when
        `/admin/store` gained children.
      */
      { role: "admin", href: "/admin/settings", label: "Settings", icon: IconSliders, exact: true },
      /*
        Beside Settings and behind the same role. The transport is where mail
        *works* and this is where it *reads*, and the two are worked in one
        sitting — which is also why the console path mirrors the API's, so
        `AdminNavRolesTest` can map this row to a real route rather than
        skipping the newest entry in the sidebar.
      */
      { role: "admin", href: "/admin/settings/email-templates", label: "Email templates", icon: IconMail },
      { role: "admin", href: "/admin/users", label: "Staff", icon: IconUsers },
      /*
        Outgoing webhooks, beside Staff and behind the same role: a hook is
        handed every lead's telephone number and every order's address at an
        address somebody typed, which is the same class of decision as the
        SMTP settings above it. The console path is the API's, so
        `AdminNavRolesTest` maps this row to `admin/webhooks` directly.
      */
      { role: "admin", href: "/admin/webhooks", label: "Webhooks", icon: IconPlug },
      /*
        Importing a WordPress / WooCommerce site. `role:admin` because one
        import writes content, the shop's catalogue and customer accounts at
        once. The console path is the API's, so `AdminNavRolesTest` maps it
        to `admin/imports/wordpress` directly.
      */
      { role: "admin", href: "/admin/imports/wordpress", label: "WordPress import", icon: IconArrows },
      /*
        Backups and their settings (2026-09-27, docs/backups.md). `role:admin`:
        a backup is every customer and every ticket attachment in one file, and
        a restore replaces the lot. The paths are the API's, so
        `AdminNavRolesTest` maps both rows to real routes; the settings row is
        the Settings row at the end of this module, the rule every module's
        own settings follow. Never `exact` on Backups — the sidebar lights the
        longest match (`nav-match.ts`).
      */
      { role: "admin", href: "/admin/backups", label: "Backups", icon: IconBackup },
      { role: "admin", href: "/admin/backups/settings", label: "Backup settings", icon: IconSliders },
      /*
        The installed version and whether its parts agree, and applying a new
        release (2026-09-28, docs/distribution.md). `role:admin`: an update
        replaces the whole application. The paths are the API's, so
        `AdminNavRolesTest` maps both rows to real routes.
      */
      { role: "admin", href: "/admin/system/status", label: "System status", icon: IconGauge },
      { role: "admin", href: "/admin/system/updates", label: "Updates", icon: IconCloud },
      // Beside Staff: both answer questions about people rather than content.
      { role: "admin", href: "/admin/activity", label: "Activity", icon: IconClock },
      /*
        `role:admin`, like the activity log beside it: a failure message can
        carry a route, a record id and occasionally a fragment of somebody's
        input, which is not something a content editor has reason to read.

        This filter is a convenience, not the access control —
        `EnsureUserHasRole` is that, on the route itself. `AdminNavRolesTest`
        compares the two.
      */
      { role: "admin", href: "/admin/client-errors", label: "JavaScript errors", icon: IconAlert },
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

export function neonFor(href: string): string {
  let hash = 0;
  for (let i = 0; i < href.length; i++) hash = (hash * 31 + href.charCodeAt(i)) >>> 0;

  return `var(--color-neon-${(hash % NEON_COUNT) + 1})`;
}

/**
 * What this person may actually reach.
 *
 * An `admin` passes every role check on the server, so it passes every one
 * here — one rule, stated once, rather than an `admin` entry on all 24 rows.
 */
export function permits(roles: string[], role?: RoleGate): boolean {
  if (role === undefined) return true;
  if (roles.includes("admin")) return true;

  return role.split(",").some((r) => roles.includes(r));
}


/** The rows this account is shown, before the icons are rendered. */
/**
 * The role a console path needs, read off this map.
 *
 * The sidebar filters what is *offered*; this is what lets the layout refuse
 * what is *typed*. Before it, a content manager who pasted `/admin/users`
 * reached the page and read its error state — the API refused the data, so
 * nothing was exposed, but a screen that renders and then says "could not
 * load" is the wrong answer to "you may not be here". The longest row whose
 * href is the path or a parent of it decides; an `exact` row matches only
 * itself, which is what keeps `/admin` (the dashboard, a `support_engineer`
 * screen) from claiming every path under it. A path no row names — the
 * profile, a screen added before its row — needs nothing, and the API still
 * has the last word on every one.
 */
export function screenRole(pathname: string): RoleGate | undefined {
  const gate = SCREEN_GATES.find((g) => g.match.test(pathname));
  if (gate) return gate.role;

  return bestRow(NAV.flatMap((item) => (item.kind === "link" ? [item] : item.links)), pathname)?.role;
}

/**
 * Screens whose role is not the role of the row they sit under.
 *
 * `bestRow` gates a path on the longest sidebar row above it, which is right
 * for every record screen but one kind: a screen under a record's **id** that
 * a second desk works. An event's registrations are `/admin/events/{id}/
 * registrations`; the longest row above that is Events, a `content_manager`
 * screen, and the API gives the registrations to
 * `role:content_manager,sales_manager` — so by the row alone a sales manager
 * following the link in a "new registration" email met a 404 for a list the
 * API would have handed them. No row can fix it, because a row's path is a
 * prefix and the id is in the middle.
 *
 * So the exception is stated here, once, as a path shape and the route's own
 * `role:` spelling. Checked before the rows; anything not listed is gated by
 * its row exactly as before. Keep each entry to one line with no `h`+`ref`
 * key in it — `AdminNavRolesTest` reads rows out of this file by that key,
 * and this is not a row.
 */
const SCREEN_GATES: { match: RegExp; role: RoleGate }[] = [
  { match: /^\/admin\/events\/\d+\/registrations$/, role: "content_manager,sales_manager" },
];

export function navFor(roles: string[]): NavItem[] {
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
  return NAV.flatMap<NavItem>((item) => {
    if (item.kind === "link") return permits(roles, item.role) ? [item] : [];

    const links = item.links.filter((l) => permits(roles, l.role));

    if (links.length === 0) return [];

    /*
      A section with one row left is rendered as that row.

      The sibling of the rule above it, and the same argument: a group whose
      every child is hidden is dropped rather than drawn empty, and a group
      with exactly one visible child is a press to reach one destination.
      "Your account" inside "Site" is the case this file already records —
      a campaign manager reached nothing else in that section.

      It is what makes a two-role section affordable. Careers holds Vacancies
      (`content_manager`) and Applications (`support_engineer`), so only an
      administrator sees both; without this, each of the other two would be
      shown a section called Careers containing a single link. With it they get
      the link, in the position the section occupied, and the grouping exists
      for exactly the person it helps.

      Measured: an administrator gets 9 sections and 46 rows, a content manager
      5 sections and 21 rows with Vacancies as a plain row, a support engineer
      4 top-level rows with Applications among them.
    */
    if (links.length === 1) return [{ kind: "link", ...links[0] }];

    return [{ ...item, links }];
  });
}

/** A row as the client component receives it: the icon already an element. */
export type NavRow = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  /** The row's fluorescent hue, from `neonFor` — applied only while inactive. */
  hue: string;
};

export type NavEntry =
  | ({ kind: "link" } & NavRow)
  | { kind: "group"; id: string; label: string; icon: ReactNode; hue: string; links: NavRow[] };

/**
 * What the layout hands `AdminNav`. Icons become elements here, on the
 * server, so the client bundle carries the sidebar's three chrome glyphs and
 * not the map. The hue travels as a string rather than being applied as a
 * style, because whether it applies depends on the pathname, which only the
 * client knows.
 */
/**
 * The same rows as `{label, href, group}` for the command palette — the
 * screens this role may open, with no icons, so the palette's client bundle
 * carries none of the map either — plus, for each settings screen the role
 * may open, its tabs and its fields, and the named parts of a screen in
 * `PALETTE_SECTIONS`.
 */
export function palettePages(roles: string[]): { label: string; href: string; group?: string; keywords?: string }[] {
  const screens = navFor(roles).flatMap((item) =>
    item.kind === "link"
      ? [{ label: item.label, href: item.href }]
      : item.links.map((l) => ({ label: l.label, href: l.href, group: item.label })),
  );
  const open = new Set(screens.map((s) => s.href));
  const reachable = (r: { href: string }) => open.has(r.href.split(/[?#]/)[0]);
  return [...screens, ...PALETTE_SECTIONS.filter(reachable), ...settingsPages().filter(reachable)];
}

/**
 * Parts of a screen that people look for by a name the screen does not carry.
 *
 * Asked for on 2026-10-08: "I have searched for cron in Ctrl+K but not
 * coming". The scheduler's command is a card on System status, and the
 * palette matched only a screen's own label and its group — so the one thing
 * an administrator is sent to find after installing had no row. Each entry
 * opens its screen at the part's own id, and `keywords` are the other words
 * somebody types for it; the palette matches them and never shows them. Kept
 * by `palettePages` only for a role whose sidebar names the screen, the rule
 * the settings rows follow.
 */
const PALETTE_SECTIONS: { label: string; href: string; group: string; keywords: string }[] = [
  {
    label: "Scheduler command (cron job)",
    href: "/admin/system/status#scheduler",
    group: "System · System status",
    keywords: "cron crontab cronjob scheduler schedule:run schedule:work scheduled task task scheduler background jobs queue",
  },
];

/**
 * The settings screens, one row per tab and one per setting.
 *
 * Asked for on 2026-09-17: "Ctrl+K cannot find this level — it should find
 * the last level of the settings options, otherwise it is not useful". The
 * sidebar had one row, Settings, and twenty tabs behind it, each holding
 * five to fifteen fields: "Social profiles" and "Assistant colour" were
 * unreachable from the palette. A tab opens through `?tab=`, which `Tabs`
 * reads once as its starting panel; a field adds `#setting__<key>`, the id
 * every generated control carries, so the browser scrolls to it. Built
 * from `SCREENS` in `settings-copy.ts` — the one list — so a setting added
 * there is in the palette without anybody remembering it, at whichever
 * screen draws its group. A screen with one group gets no tab row: its
 * sidebar row is already that door. `palettePages` keeps only the screens
 * the role's sidebar names, which is the same check the sidebar makes.
 */
function settingsPages(): { label: string; href: string; group: string }[] {
  const rows: { label: string; href: string; group: string }[] = [];
  for (const screen of SCREENS) {
    const groups = screen.sections.flatMap((x) => x.groups);
    for (const group of groups) {
      const title = (GROUP_TITLES[group] ?? { title: group }).title;
      if (groups.length > 1) {
        rows.push({ label: title, href: `${screen.path}?tab=${group}`, group: `${screen.area} · ${screen.title}` });
      }
      for (const key of FIELD_ORDER[group] ?? []) {
        if (HIDDEN.has(key)) continue;
        const label = LABELS[key]?.label;
        if (label) rows.push({ label, href: `${screen.path}?tab=${group}#setting__${key}`, group: `${screen.area} · ${title}` });
      }
    }
  }
  return rows;
}

export function renderNav(roles: string[]): NavEntry[] {
  const row = (l: NavLink): NavRow => ({
    href: l.href, label: l.label, exact: l.exact, hue: neonFor(l.href), icon: <l.icon />,
  });

  return navFor(roles).map((item) =>
    item.kind === "link"
      ? { kind: "link", ...row(item) }
      : { kind: "group", id: item.id, label: item.label, hue: neonFor(item.id), icon: <item.icon />, links: item.links.map(row) },
  );
}
