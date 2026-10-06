import type { ReactNode } from "react";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { SectionBg, homeSeeds } from "@/components/ui/section-bg";
import { sectionReveal } from "@/lib/motion-choices";
import { getSiteSettings } from "@/lib/settings";
import { activeTheme } from "@/themes";
import type { PageSection } from "@/types/api";
import type { SectionStyle } from "@/types/page-sections";
import { cn } from "@/lib/utils";
import { HeroSection } from "./hero-section";
import {
  DividerSection, FeaturesSection, MediaTextSection, RichTextSection, TestimonialSection, VideoSection,
} from "./content-sections";
import {
  CardsSection, ContentBlockSection, FaqSection, FormSection, GallerySection, LogosSection, SliderSection,
} from "./embed-sections";
import {
  BeforeAfterSection, ChecklistSection, ComparisonSection, CtaSection, StatsSection, StepsSection, TabsSection,
  TestimonialsSection, TimelineSection,
} from "./visual-sections";
import { ColumnsSection, CountdownSection, DownloadsSection, MapSection, TeamSection } from "./people-sections";
import { ThemeSectionSlot } from "./theme-section";
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
export async function PageSections({ sections, crumbs, ownsH1 = true, marked = false }: {
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
        const node = renderSection(section, { first: ownsH1 && i === 0, eager: i <= 1, crumbs, themeId: theme.manifest.id });
        if (!node) return null;

        const drawn = (
          <SectionBg key={section.id} id={`page-${section.type}`} bg={section.background ?? undefined} seeds={seeds} eager={i <= 1}>
            <StyledSection style={section.style}>{node}</StyledSection>
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
 * Devices it is not shown on are the `hidden` **class** at those widths
 * (Tailwind v4's preflight makes the attribute `!important`, which no
 * breakpoint could win back).
 */
function StyledSection({ style, children }: { style?: SectionStyle | null; children: ReactNode }) {
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
      className={hide || undefined}
    >
      {children}
    </div>
  );
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
const STILL: ReadonlySet<string> = new Set(["content_block", "logos", "divider", "cta"]);

function renderSection(
  section: PageSection,
  { first, eager, crumbs, themeId }: { first: boolean; eager: boolean; crumbs: Crumb[]; themeId: string },
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
