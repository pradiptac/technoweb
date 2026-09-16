import type { ComponentType, ReactNode } from "react";
import type { Announcement } from "@/lib/announcement";
import type { publicApi } from "@/lib/api";
import type { Motion } from "@/lib/motion-choices";
import type {
  defaultTopBar, getBottomBarNav, getFooterNav, getMegaMenu, getPrimaryNav, getTopBarNav,
} from "@/lib/navigation";
import type { BannerSection, SiteSettings } from "@/lib/site-settings";
import type { BackdropVariant } from "@/components/ui/backdrop";
import type { Crumb } from "@/components/ui/page-hero";

/**
 * What a theme is, to the rest of the site.
 *
 * A theme is a folder under `src/themes/<id>/` that fills the slots below;
 * the pages, the data layer and the caching stay exactly where they are.
 * **Every prop here is a type the data layer already produces** — the
 * layout's fetches, the homepage's fetches, the settings map — and none is
 * a function. That is the whole discipline: a template receives data and
 * returns markup, so a theme cannot fetch on its own (and so make one page
 * dynamic where the others are cached), cannot reach a cookie, and cannot
 * emit structured data — `JsonLd` stays in the pages and the layout.
 *
 * Step 1 (2026-09-16) declares only the slots that have a caller today.
 * `Card`, `SectionHeader` and `Container` are deliberately not slots:
 * `card.tsx` is imported by three console client components, and a
 * server-only registry behind it would be the `lib/settings.ts` 500 on every
 * console screen. A theme restyles those through `[data-theme="<id>"]`
 * rules in its own `theme.css`. Slots for a detail page's frame and a
 * collection's shape are added in the step whose theme needs them, with
 * `classic` getting the pass-through.
 */
export type ThemeManifest = {
  /** Kebab-case, the folder name, what the setting stores. */
  id: string;
  /** Shown on the console's gallery card. */
  name: string;
  /** One line under the name: what this architecture is for. */
  blurb: string;
  /** Under `public/`, written by `npm run theme-shots`; may not exist yet. */
  screenshot: string;
  /** A child theme fills only the slots it changes; the rest come from here. */
  extends?: string;
};

/** The marketing layout's fetches, resolved, plus the two derived settings. */
export type ChromeData = {
  settings: SiteSettings;
  menu: Awaited<ReturnType<typeof getMegaMenu>>;
  primary: Awaited<ReturnType<typeof getPrimaryNav>>;
  footerMenu: Awaited<ReturnType<typeof getFooterNav>>;
  topBar: Awaited<ReturnType<typeof getTopBarNav>> | ReturnType<typeof defaultTopBar>;
  bottomBar: Awaited<ReturnType<typeof getBottomBarNav>>;
  motion: Motion;
  announcement: Announcement | null;
};

/** The homepage's fetches, resolved. */
export type HomeData = {
  settings: SiteSettings;
  solutions: Awaited<ReturnType<typeof publicApi.solutions>>;
  categories: Awaited<ReturnType<typeof publicApi.productCategories>>;
  industries: Awaited<ReturnType<typeof publicApi.industries>>;
  caseStudies: Awaited<ReturnType<typeof publicApi.caseStudies>>;
  posts: Awaited<ReturnType<typeof publicApi.posts>>;
  brands: Awaited<ReturnType<typeof publicApi.brands>>;
  clients: Awaited<ReturnType<typeof publicApi.clients>>;
  certifications: Awaited<ReturnType<typeof publicApi.certifications>>;
  heroSlider: Awaited<ReturnType<typeof publicApi.slider>>["data"] | null;
};

/** `PageHero`'s public props, plus the settings the dispatcher has read. */
export type PageHeroProps = {
  kicker?: string;
  title: string;
  lede?: string | null;
  crumbs?: Crumb[];
  children?: ReactNode;
  tone?: "light" | "dark";
  section?: BannerSection;
  settings: SiteSettings;
};

/** `CtaBand`'s public props, plus the telephone number the dispatcher resolved. */
export type CtaBandProps = {
  title?: string;
  body?: string;
  tone?: "accent" | "brand";
  size?: "md" | "lg";
  backdrop?: BackdropVariant;
  className?: string;
  phone: string;
};

export type ThemeTemplates = {
  /** The header, `<main id="main">` around the page, and the footer. */
  Chrome: ComponentType<ChromeData & { children: ReactNode }>;
  /** The homepage's composition. */
  Home: ComponentType<HomeData>;
  /** The heading block every first- and second-level page opens with. Must render `Breadcrumbs` when given `crumbs`. */
  PageHero: ComponentType<PageHeroProps>;
  /** The closing band. */
  CtaBand: ComponentType<CtaBandProps>;
};

export type Theme = {
  manifest: ThemeManifest;
  templates: ThemeTemplates;
};
