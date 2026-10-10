/**
 * Theme options: the choices a theme offers on top of its architecture, and
 * how the stored row resolves into a value every template can trust.
 *
 * Pure data and pure functions, safe on either side of the boundary — the
 * console's Themes screen imports the lists to draw the controls, the
 * server-only registry imports `resolveOptions()` to hand templates their
 * `options`. Nothing here fetches.
 *
 * The setting is one JSON row, `site_theme_options`, keyed by theme id:
 * `{ classic: { menu_style: "big", hero_style: "split", sections: {...} } }`.
 * Per theme rather than site-wide, because a choice like "big menu" is made
 * looking at one theme's header and would be wrong under another's; switching
 * theme switches the whole look, options included. The API checks the row's
 * shape (`App\Support\ThemeOptions`) and the lists live here — the motion
 * group's rule: a value the frontend does not know falls back to the theme's
 * own default, per field, so one stale key cannot blank a page.
 *
 * Three options every theme understands (a theme may ignore one — editorial
 * and datacenter draw no banner, so `hero_style` changes nothing under them,
 * and the console says so beside the control):
 *
 * - `menu_style` — how a top-level item's panel is drawn: a narrow list, two
 *   compact columns, the mega panel, or one spanning the whole header.
 * - `topbar_style` — how the top bar's panel opens: `match` follows `menu_style`
 *   (the default and what an install that chose nothing renders), `columns` is
 *   its own wide panel of headed columns (0.150.0).
 * - `hero_style` — how a first- or second-level page opens: the banner
 *   band, a taller centred cover, the words beside the picture, or the
 *   headline alone.
 * - `sections` — per homepage section: whether it renders at all, and a
 *   background — the theme's own, a solid colour, a two-stop gradient, or a
 *   picture under an overlay. The ink on a custom background is derived
 *   from the colour so it clears AA on every stop; see
 *   `lib/section-background.ts`.
 * - `section_order` — the homepage's sections in the order to draw them.
 *   Ids the theme does not draw are ignored; sections the list leaves out
 *   follow in the theme's own order, so a section added later still shows.
 */

export type MenuStyle = "simple" | "semi" | "mega" | "big";
/** How the top bar's panel opens: following `menu_style`, or the client's columns (0.150.0). */
export type TopBarPanelStyle = "match" | "columns";
export type HeroStyle = "banner" | "cover" | "split" | "compact";
/** Where a category card's name sits beside its icon: next to it, or at the card's far edge. */
export type HeadingAlign = "left" | "right";
export type SectionKind = "default" | "page" | "solid" | "gradient" | "image" | "scene";
export type SectionTexture = "none" | "grain" | "mesh" | "glow" | "grid" | "dots";

export type SectionBackground = {
  kind: SectionKind;
  /** `#rrggbb`; the ground for `solid`, the first stop for `gradient`, the overlay for `image`. */
  colour?: string;
  /** The second stop of a gradient. */
  colour2?: string;
  /** Degrees, for a gradient. */
  angle?: number;
  /** A media-library path, the console's round-trip value. */
  image_path?: string;
  /** Derived by the API beside `image_path`, never stored. */
  image_url?: string;
  /** The file's focal point, derived beside `image_url` the same way — `"30% 20%"`, or absent for the centre. */
  image_focus?: string;
  /** 0–90: how much of the overlay colour sits over the picture. */
  overlay?: number;
  /** For `scene` (0.126.0): the animation's id, one of the sign-in screen's (`lib/login-backdrop-choices.ts`). */
  scene?: string;
  /** A decorative layer over the ground (2026-10-05); absent is none. */
  texture?: SectionTexture;
};

/** One homepage section's settings: drawn or not, what it sits on, and how it arrives. */
export type SectionSetting = {
  enabled: boolean;
  bg?: SectionBackground;
  /**
   * A `SECTION_REVEALS` id (lib/motion-choices.ts), checked for shape only
   * and resolved by `sectionReveal()`; absent means it does not move — the
   * homepage's default since the 2026-09-15 UX audit.
   */
  reveal?: string;
};

export type ThemeOptions = {
  menu_style: MenuStyle;
  topbar_style: TopBarPanelStyle;
  hero_style: HeroStyle;
  /**
   * A theme's own option (2026-09-19): only a manifest that lists it under
   * `offers` draws the control, and every theme still resolves it so a
   * template can read it without a guard. Sentinel's category cards.
   */
  heading_align: HeadingAlign;
  sections: Partial<Record<string, SectionSetting>>;
  /** Section ids in the order chosen; empty means the theme's own order. */
  order: string[];
  /**
   * One section and nothing else (0.113.0): how a builder page's
   * `theme_section` draws a single piece of the active theme's homepage. Never
   * stored and never resolved from the row — `ThemeSectionSlot` sets it on the
   * options it hands `Home`, so `orderSections()` is the one place every
   * theme's homepage is narrowed and no template had to learn about it.
   */
  only?: string;
};

/** What a manifest may declare as its own starting point. */
export type ThemeDefaults = Partial<Pick<ThemeOptions, "menu_style" | "hero_style" | "heading_align">>;

/** The options a theme may opt *into*, the inverse of `ignores` — shown only where a manifest offers them. */
export type OfferedOption = "heading_align";

export type Choice<T extends string> = { id: T; label: string; blurb: string };

export const MENU_STYLES: readonly Choice<MenuStyle>[] = [
  { id: "simple", label: "Simple", blurb: "A narrow list of links, nothing else. The quietest." },
  { id: "semi", label: "Semi mega", blurb: "Two compact columns with icons and no summaries." },
  { id: "mega", label: "Mega", blurb: "Three columns, an icon and a summary per entry." },
  { id: "big", label: "Big mega", blurb: "A panel as wide as the header, four columns, the section's link along the foot." },
];

export const TOPBAR_STYLES: readonly Choice<TopBarPanelStyle>[] = [
  { id: "match", label: "Same as the menu", blurb: "The panel under a top-bar link opens in the menu style above — tabs and cards." },
  { id: "columns", label: "Columns", blurb: "A wide panel under a thin brand line: a heading over each column of links, each with its status chip and a line of description. Everything shows at once." },
];

export const HERO_STYLES: readonly Choice<HeroStyle>[] = [
  { id: "banner", label: "Banner", blurb: "The section's picture behind the heading, words on the left." },
  { id: "cover", label: "Cover", blurb: "Taller, the words centred over the picture." },
  { id: "split", label: "Split", blurb: "Words on the left, the picture in a frame on the right, on the page's own ground." },
  { id: "compact", label: "Compact", blurb: "The headline and the trail alone; no picture." },
];

export const HEADING_ALIGNS: readonly Choice<HeadingAlign>[] = [
  { id: "left", label: "Beside the icon", blurb: "The name follows the icon on the same line." },
  { id: "right", label: "At the right edge", blurb: "The icon on the left, the name pushed to the card's right edge, on one line." },
];

/**
 * The textures a section ground can carry (2026-10-05), the API's
 * `ThemeOptions::TEXTURES` with words. Drawn by `SectionBg` on a layer of
 * its own behind the content, so the ink is graded against the ground and a
 * texture can never be what fails the contrast audit; each is a whisper —
 * the CSS is `[data-texture]` in `globals.css`.
 */
export const SECTION_TEXTURES: readonly Choice<SectionTexture>[] = [
  { id: "none", label: "None", blurb: "The ground alone." },
  { id: "grain", label: "Film grain", blurb: "A fine noise, like printed paper — it takes the flatness off a colour." },
  { id: "mesh", label: "Colour mesh", blurb: "Soft pools of the palette's colours in the corners." },
  { id: "glow", label: "Glow", blurb: "One soft light from the top, behind the heading." },
  { id: "grid", label: "Grid", blurb: "A faint blueprint grid fading towards the edges." },
  { id: "dots", label: "Dots", blurb: "A faint dot field fading towards the edges." },
];

export const SECTION_KINDS: readonly Choice<SectionKind>[] = [
  { id: "default", label: "Theme's own", blurb: "Whatever the theme draws." },
  { id: "page", label: "None", blurb: "No band: the page's own ground and its own inks, light in light and dark in dark." },
  { id: "solid", label: "Solid colour", blurb: "One colour; the text is derived to read on it." },
  { id: "gradient", label: "Gradient", blurb: "Two colours at an angle; the text reads on both." },
  { id: "image", label: "Picture", blurb: "A photograph under a colour overlay." },
  { id: "scene", label: "Animation", blurb: "A slow animation in your palette's colours over the theme's dark band. Visitors can pause it, and it is still for anyone who asks for less motion." },
];

/**
 * The homepage's sections, in page order, as the console lists them. The ids
 * are what `SectionBg` is keyed on in each theme's `Home`; a theme that does
 * not draw a section simply never asks for its background.
 */
export const HOME_SECTIONS: readonly { id: string; label: string }[] = [
  { id: "hero", label: "Hero" },
  { id: "partners", label: "Partners" },
  { id: "solutions", label: "Solutions" },
  { id: "categories", label: "Product categories" },
  { id: "why", label: "Why us" },
  { id: "clients", label: "Trusted by" },
  { id: "credentials", label: "Credentials" },
  { id: "reviews", label: "Reviews (Google, via Elfsight)" },
  { id: "industries", label: "Industries" },
  // `web` is the Services section (the services by category, as tabs); the
  // id is the one the static "Web services" grid had, so stored rows carry over.
  { id: "web", label: "Services" },
  // Where a theme's `web` slot already carries a section of its own
  // (Enterprise's solution tabs, Horizon's why-block), the services go here.
  { id: "services", label: "Services (Enterprise, Horizon)" },
  { id: "support", label: "Support band" },
  { id: "cases", label: "Case studies" },
  { id: "resources", label: "Resources" },
  // Content blocks (2026-09-24): drawn only when one is chosen in Site →
  // Settings → Homepage; placed and switched here like any section.
  { id: "stats_block", label: "Stat bar (block)" },
  { id: "stack", label: "Technology stack (block)" },
  { id: "pricing", label: "Pricing (block)" },
  // The shop's "shop the videos" row (0.140.0): drawn only when Store →
  // Product videos has the homepage switched on and a product has a video.
  { id: "videos", label: "Product videos (shop)" },
  { id: "cta", label: "Closing band" },
];

/** The one section that cannot be switched off. */
export const LOCKED_SECTION = "hero";

const ID = /^[a-z][a-z0-9_-]{0,31}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const PATH = /^[a-z0-9][a-z0-9_./-]{0,254}$/i;

function choice<T extends string>(list: readonly Choice<T>[], value: unknown, fallback: T): T {
  return typeof value === "string" && list.some((c) => c.id === value) ? (value as T) : fallback;
}

/** One stored section row: `enabled` and the background it carries, if any part of that is the shape it should be. */
function sectionSetting(raw: unknown): SectionSetting | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const reveal = typeof r.reveal === "string" && /^[a-z][a-z0-9-]{0,15}$/.test(r.reveal) ? r.reveal : undefined;
  return { enabled: r.enabled !== false, bg: sectionBackground(r), reveal };
}

function sectionBackground(r: Record<string, unknown>): SectionBackground | undefined {
  const kind = choice(SECTION_KINDS, r.kind, "default");
  if (kind === "default") return undefined;

  const colour = typeof r.colour === "string" && HEX.test(r.colour) ? r.colour.toLowerCase() : undefined;
  const colour2 = typeof r.colour2 === "string" && HEX.test(r.colour2) ? r.colour2.toLowerCase() : undefined;
  const angle = typeof r.angle === "number" && r.angle >= 0 && r.angle <= 360 ? r.angle : undefined;

  const tx = choice(SECTION_TEXTURES, r.texture, "none");
  const texture = tx === "none" ? undefined : tx;

  if (kind === "page") return { kind, texture };
  if (kind === "scene") {
    const scene = typeof r.scene === "string" && /^[a-z][a-z0-9-]{1,31}$/.test(r.scene) ? r.scene : undefined;
    return scene ? { kind, scene } : undefined;
  }
  if (kind === "solid") return colour ? { kind, colour, texture } : undefined;
  if (kind === "gradient") return colour && colour2 ? { kind, colour, colour2, angle, texture } : undefined;

  const image_path = typeof r.image_path === "string" && PATH.test(r.image_path) && !r.image_path.includes("..") ? r.image_path : undefined;
  const image_url = typeof r.image_url === "string" && /^https?:\/\//.test(r.image_url) ? r.image_url : undefined;
  const image_focus = typeof r.image_focus === "string" && /^\d{1,3}% \d{1,3}%$/.test(r.image_focus) ? r.image_focus : undefined;
  const overlay = typeof r.overlay === "number" && r.overlay >= 0 && r.overlay <= 90 ? r.overlay : 60;
  return image_path && image_url ? { kind, colour, image_path, image_url, image_focus, overlay, texture } : undefined;
}

/**
 * The options for one theme, from the stored row — per-field fallback to the
 * theme's defaults, and a row that does not parse is the defaults whole.
 */
export function resolveOptions(raw: string | undefined, themeId: string, defaults: ThemeDefaults = {}): ThemeOptions {
  let stored: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const mine = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)[themeId] : undefined;
      if (mine && typeof mine === "object" && !Array.isArray(mine)) stored = mine as Record<string, unknown>;
    } catch {
      // A hand-edited row that is not JSON: the defaults, and nothing to say.
    }
  }

  const sections: ThemeOptions["sections"] = {};
  const rawSections = stored.sections;
  if (rawSections && typeof rawSections === "object" && !Array.isArray(rawSections)) {
    for (const [id, row] of Object.entries(rawSections as Record<string, unknown>)) {
      const cleaned = sectionSetting(row);
      if (cleaned) sections[id] = cleaned;
    }
  }

  const order = Array.isArray(stored.section_order)
    ? stored.section_order.filter((id): id is string => typeof id === "string" && ID.test(id))
    : [];

  return {
    menu_style: choice(MENU_STYLES, stored.menu_style, defaults.menu_style ?? "mega"),
    topbar_style: choice(TOPBAR_STYLES, stored.topbar_style, "match"),
    hero_style: choice(HERO_STYLES, stored.hero_style, defaults.hero_style ?? "banner"),
    heading_align: choice(HEADING_ALIGNS, stored.heading_align, defaults.heading_align ?? "left"),
    sections,
    order,
  };
}

/**
 * A theme's homepage sections in the order and set the options ask for.
 *
 * `entries` is the theme's own order — the fallback, and where a section the
 * stored order does not name goes (after the named ones, in the theme's
 * order), so a section added to a theme later still renders. A section
 * switched off is left out. A theme that does not draw a section the order
 * names simply never lists it here.
 *
 * `only` narrows it to one entry before any of that: the order is beside the
 * point for a single section, and the switch is the homepage's — a builder
 * page that places a section has decided to show it, whether or not the
 * homepage does. A theme that does not draw that section yields nothing.
 */
export function orderSections<T extends { id: string }>(entries: readonly T[], options: ThemeOptions): T[] {
  if (options.only !== undefined) return entries.filter((e) => e.id === options.only);
  const named = options.order
    .map((id) => entries.find((e) => e.id === id))
    .filter((e): e is T => e !== undefined);
  const rest = entries.filter((e) => !options.order.includes(e.id));
  // The hero is never dropped — a homepage opens on it whatever a stored row
  // says (the client's rule, 2026-09-17; the console offers no switch for it).
  return [...named, ...rest].filter((e) => e.id === LOCKED_SECTION || options.sections[e.id]?.enabled !== false);
}

/** The whole row parsed for the console: every theme's stored choices, raw. */
export function parseOptionsRow(raw: string | null | undefined): Record<string, Record<string, unknown>> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === "object" && !Array.isArray(v)) out[k] = v as Record<string, unknown>;
    }
    return out;
  } catch {
    return {};
  }
}
