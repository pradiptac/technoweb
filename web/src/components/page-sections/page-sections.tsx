import { Fragment } from "react";
import type { ReactNode } from "react";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { SectionBg, homeSeeds } from "@/components/ui/section-bg";
import { sectionReveal } from "@/lib/motion-choices";
import { getSiteSettings } from "@/lib/settings";
import { activeTheme } from "@/themes";
import type { PageSection } from "@/types/api";
import type { SectionDeviceStyle, SectionStyle } from "@/types/page-sections";
import { cn } from "@/lib/utils";
import { HeroSection } from "./hero-section";
import {
  DividerSection, FeaturesSection, MediaTextSection, RichTextSection, TestimonialSection, VideoSection,
} from "./content-sections";
import {
  CardsSection, ContentBlockSection, FaqSection, FormSection, GallerySection, LogosSection, ProductVideosSection, SliderSection,
} from "./embed-sections";
import {
  BeforeAfterSection, ChecklistSection, ComparisonSection, CtaSection, StatsSection, StepsSection, TabsSection,
  TestimonialsSection, TimelineSection,
} from "./visual-sections";
import { ColumnsSection, CountdownSection, DownloadsSection, MapSection, TeamSection } from "./people-sections";
import { ThemeSectionSlot } from "./theme-section";
import { StorySection } from "./story-section";
import { FlowSection } from "./flow-section";
import { SubnavSection } from "./subnav-section";
import { LayoutSection } from "./layout/layout-section";
import { CustomCodeSection } from "./custom-code-section";
import { setHeroLevel } from "@/lib/hero-heading";
import { LOCKED_SECTION } from "@/themes/options";

/**
 * A builder page's sections, in order (`docs/page-builder.md`).
 *
 * One server component per type, each inside `SectionBg` — the homepage
 * sections' shell, so a background chosen here means exactly what it means
 * on the Themes screen: a local palette whose inks are pushed to AA on every
 * stop, or nothing at all when none is chosen. The first two sections load
 * their pictures eagerly; they are above the fold at every ordinary size.
 *
 * `first` is what decides the page's one `h1`: a hero that opens the page
 * is it, and the route draws no `PageHero` then (`startsWithHero`).
 *
 * The API has already dropped hidden sections and any whose reference has
 * gone; a type this build does not know renders nothing, since a stored
 * type outlives the code that drew it.
 */
export async function PageSections({ sections, crumbs, ownsH1 = true, marked = false, runCode = false }: {
  sections: PageSection[];
  crumbs: Crumb[];
  /**
   * The builder's live preview (0.112.0): each section in a box carrying its
   * id, which `BuilderPreviewBridge` reads to tell the builder which section
   * was pressed and to scroll to the one being edited. Never on a public page.
   */
  marked?: boolean;
  /**
   * False inside the console's previews, where the screen already has its
   * `h1`: an opening hero is then an `h2` with no trail, so the preview
   * keeps the one-`h1` rule the audit holds every screen to.
   */
  ownsH1?: boolean;
  /**
   * Whether a custom code section may execute its code (0.158.0). **False by
   * default, so every console surface — the previews, the live frame, the theme
   * preview — draws a labelled placeholder**; only the public page and record
   * routes pass true. Code is stored raw, and the console shares an origin with
   * the site, so "run it unless told not to" would be one forgotten prop away
   * from executing a content manager's script inside an administrator's session.
   */
  runCode?: boolean;
}) {
  if (!sections.length) return null;

  // A theme's homepage hero (`theme_section`) is that page's `h1` only when
  // this page owns its `h1` and opens on it; anywhere else — the console's
  // previews, or further down under a `PageHero` or a builder hero — it is an
  // `h2`. Set here, before any section renders, because the hero is drawn by
  // a theme's `Home` that knows nothing of where it is (`lib/hero-heading.tsx`).
  if (!(ownsH1 && opensOnThemeHero(sections))) setHeroLevel("h2");

  const [settings, theme] = await Promise.all([getSiteSettings(), activeTheme()]);
  const seeds = homeSeeds(settings);

  return (
    <div data-page-sections>
      {sections.map((section, i) => {
        const node = renderSection(section, { first: ownsH1 && i === 0, eager: i <= 1, crumbs, themeId: theme.manifest.id, runCode });
        if (!node) return null;

        // An in-page menu is drawn bare: its `<nav>` is `position: sticky`,
        // and a sticky element is held by its own parent's box — so it has
        // to be a direct child of this wrapper, the one that spans the page.
        // Inside a background shell or a style wrapper it would stick for
        // the height of that wrapper, which is its own height: not at all.
        if (section.type === "subnav" && !marked) return <Fragment key={section.id}>{node}</Fragment>;

        const frame = frameAttrs(section.style);
        const drawn = (
          <SectionBg
            key={section.id}
            id={`page-${section.type}`}
            bg={section.background ?? undefined}
            seeds={seeds}
            eager={i <= 1}
            // A top edge is cut out of the section above it. The page's first
            // section has none, and an in-page menu is an opaque bar pinned
            // over whatever follows it — the cut would be hidden under it.
            frame={frame}
            edges={{ top: i > 0 && sections[i - 1]?.type !== "subnav" ? section.style?.edge_top : undefined, bottom: section.style?.edge_bottom }}
          >
            <StyledSection style={section.style} frame={section.background ? undefined : frame}>{node}</StyledSection>
          </SectionBg>
        );

        return marked ? <div key={section.id} data-builder-id={section.id}>{drawn}</div> : drawn;
      })}
    </div>
  );
}

/**
 * A section's style choices (`SectionStyle`), as one wrapper the CSS reads —
 * `[data-section-style]` in globals.css — so no section component had to
 * learn about spacing, width, alignment or heading size. No style, no
 * wrapper: an unstyled section's markup is what it always was.
 *
 * `headline` and `scroll` (0.114.0) are the motion half: how the section's
 * heading arrives and what the section does as the page scrolls. Both are
 * CSS scroll-driven animations keyed on these attributes, inside the
 * reduced-motion guard and `@supports (animation-timeline: view())`, so a
 * browser without them or a visitor who asked for less motion simply gets
 * the section at rest.
 *
 * Devices it is not shown on are the `hidden` **class** at those widths
 * (Tailwind v4's preflight makes the attribute `!important`, which no
 * breakpoint could win back).
 */
function StyledSection({ style, frame, children }: { style?: SectionStyle | null; frame?: Record<string, string | undefined>; children: ReactNode }) {
  if (!style) return <>{children}</>;
  const shown = style.show_on;
  const hide = shown
    ? cn(!shown.includes("phone") && "max-sm:hidden", !shown.includes("tablet") && "sm:max-lg:hidden", !shown.includes("desktop") && "lg:hidden")
    : undefined;
  return (
    <div
      data-section-style
      id={style.anchor}
      data-pad-top={style.pad_top}
      data-pad-bottom={style.pad_bottom}
      data-width={style.width}
      data-align={style.align}
      data-heading={style.heading}
      data-headline={style.headline}
      data-scroll={style.scroll}
      data-min-h={style.min_h}
      data-heading-color={style.heading_color}
      data-r={responsiveTokens(style.responsive, RESPONSIVE_KEYS)}
      {...frame}
      className={hide || undefined}
    >
      {children}
    </div>
  );
}

/**
 * A section's per-device overrides (0.146.0) as one space-separated token list
 * for `[data-r~="…"]` — `pt-p-s` is "padding-top, phone, small" — so a device's
 * rule is a media query in globals.css over a fixed vocabulary and no number or
 * class name is ever built from stored text. Only the API's choices reach it
 * (`SectionRules::RESPONSIVE`); an unstyled or non-responsive section returns
 * undefined and React omits the attribute, leaving its markup unchanged.
 */
const RESPONSIVE_KEYS = [["pad_top", "pt"], ["pad_bottom", "pb"], ["align", "al"], ["min_h", "mh"]] as const;
const FRAME_KEYS = [["mt", "mt"], ["mb", "mb"]] as const;
const DEVICE_CODES = [["phone", "p"], ["tablet", "t"], ["desktop", "d"]] as const;

function responsiveTokens(responsive: SectionStyle["responsive"], keys: readonly (readonly [keyof SectionDeviceStyle, string])[]): string | undefined {
  if (!responsive) return undefined;
  const tokens: string[] = [];
  for (const [device, d] of DEVICE_CODES) {
    const given = responsive[device];
    if (!given) continue;
    for (const [key, k] of keys) {
      const value = given[key];
      if (typeof value === "string" && /^[a-z]+$/.test(value)) tokens.push(`${k}-${d}-${value}`);
    }
  }
  return tokens.length ? tokens.join(" ") : undefined;
}

/**
 * The frame attributes (0.153.0): space above and below, a rule, a shadow.
 * They belong on the outermost box — the background shell when there is one,
 * else the style wrapper — so the margin sits outside the ground, the border
 * runs along its edges and the shadow falls from it. `[data-section-frame]` rules in
 * globals.css read them; only the API's choices reach here, and none of it
 * touches a colour the contrast audit grades.
 */
function frameAttrs(style: SectionStyle | null | undefined): Record<string, string | undefined> | undefined {
  if (!style) return undefined;
  const fr = responsiveTokens(style.responsive, FRAME_KEYS);
  if (!style.mt && !style.mb && !style.border && !style.shadow && !fr) return undefined;
  return { "data-section-frame": "", "data-mt": style.mt, "data-mb": style.mb, "data-border": style.border, "data-shadow": style.shadow, "data-fr": fr };
}

/**
 * Whether a builder page opens on its own hero — and so supplies its own `h1`.
 * The theme's homepage hero counts (0.113.0): a page laid out as the homepage
 * opens on it, and a `PageHero` above it would be a banner over a banner.
 */
export function startsWithHero(sections: PageSection[] | undefined): boolean {
  return sections?.[0]?.type === "hero" || opensOnThemeHero(sections);
}

/** Every theme draws the hero (`LOCKED_SECTION`), so naming it is enough. */
function opensOnThemeHero(sections: PageSection[] | undefined): boolean {
  const s = sections?.[0];
  return s?.type === "theme_section" && s.data.section === "hero";
}

/** The types that do not reveal unless an editor asks them to. */
const STILL: ReadonlySet<string> = new Set(["content_block", "logos", "divider", "cta", "custom_code"]);

function renderSection(
  section: PageSection,
  { first, eager, crumbs, themeId, runCode }: { first: boolean; eager: boolean; crumbs: Crumb[]; themeId: string; runCode: boolean },
): ReactNode {
  // How the section arrives: the editor's choice, or what the type did before
  // there was one — a band rises; a content block, a logo strip and a divider
  // are still (a block and a strip bring their own motion). The hero resolves
  // its own, since its default depends on the layout.
  const reveal = sectionReveal(section.reveal, STILL.has(section.type) ? null : "fade-up");

  switch (section.type) {
    case "hero": return <HeroSection data={section.data} first={first} crumbs={crumbs} eager={eager} revealId={section.reveal} />;
    case "rich_text": return <RichTextSection data={section.data} reveal={reveal} />;
    case "media_text": return <MediaTextSection data={section.data} eager={eager} reveal={reveal} />;
    case "features": return <FeaturesSection data={section.data} reveal={reveal} />;
    case "cards": return <CardsSection data={section.data} eager={eager} reveal={reveal} />;
    case "content_block": return <ContentBlockSection data={section.data} reveal={reveal} />;
    case "slider": return <SliderSection data={section.data} reveal={reveal} />;
    case "gallery": return <GallerySection data={section.data} reveal={reveal} />;
    case "form": return <FormSection data={section.data} reveal={reveal} />;
    case "faq": return <FaqSection data={section.data} reveal={reveal} />;
    case "logos": return <LogosSection data={section.data} themeId={themeId} reveal={reveal} />;
    case "testimonial": return <TestimonialSection data={section.data} reveal={reveal} />;
    case "video": return <VideoSection data={section.data} reveal={reveal} />;
    case "divider": return <DividerSection data={section.data} reveal={reveal} />;
    case "stats": return <StatsSection data={section.data} reveal={reveal} />;
    case "steps": return <StepsSection data={section.data} reveal={reveal} />;
    case "tabs": return <TabsSection data={section.data} reveal={reveal} id={`tabs-${section.id.slice(0, 8)}`} />;
    case "checklist": return <ChecklistSection data={section.data} reveal={reveal} />;
    case "cta": return <CtaSection data={section.data} />;
    case "comparison": return <ComparisonSection data={section.data} reveal={reveal} />;
    case "timeline": return <TimelineSection data={section.data} reveal={reveal} />;
    case "before_after": return <BeforeAfterSection data={section.data} reveal={reveal} />;
    case "testimonials": return <TestimonialsSection data={section.data} reveal={reveal} />;
    case "team": return <TeamSection data={section.data} reveal={reveal} />;
    case "downloads": return <DownloadsSection data={section.data} reveal={reveal} />;
    case "countdown": return <CountdownSection data={section.data} reveal={reveal} />;
    case "columns": return <ColumnsSection data={section.data} reveal={reveal} />;
    case "map": return <MapSection data={section.data} reveal={reveal} />;
    case "story": return <StorySection data={section.data} eager={eager} reveal={reveal} id={`story-${section.id.slice(0, 8)}`} />;
    case "flow": return <FlowSection data={section.data} reveal={reveal} />;
    case "subnav": return <SubnavSection data={section.data} />;
    case "product_videos": return <ProductVideosSection data={section.data} reveal={reveal} />;
    case "layout": return <LayoutSection data={section.data} eager={eager} reveal={reveal} />;
    case "custom_code": return <CustomCodeSection data={section.data} run={runCode} reveal={reveal} />;
    // The active theme's own homepage section, arriving as `HomeSection` would
    // have it arrive: still unless the editor chose a reveal, and never the
    // hero, which opens a page (the homepage's rule, `section-bg.tsx`).
    case "theme_section": {
      const own = section.data.section === LOCKED_SECTION ? null : sectionReveal(section.reveal, null);
      return (
        <div data-page-section="theme_section" data-theme-section={section.data.section} data-aos={own ?? undefined}>
          <ThemeSectionSlot id={section.data.section} />
        </div>
      );
    }
    default: return null;
  }
}
