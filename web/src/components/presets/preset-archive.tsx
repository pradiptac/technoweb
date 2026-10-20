import type { ReactNode } from "react";
import type { Archive } from "@/app/(marketing)/[slug]/archive";
import type { SiteSettings } from "@/lib/site-settings";
import { NewsroomArchive } from "./newsroom-archive";
import { CoverageArchive } from "./coverage-archive";
import { InvestorsArchive } from "./investors-archive";
import { TestimonialsArchive } from "./testimonials-archive";
import { AwardsArchive } from "./awards-archive";

/** The presets that draw a layout of their own. */
export const PRESET_LAYOUTS = new Set<string>(["newsroom_releases", "newsroom_coverage", "investors", "testimonials", "awards"]);

/**
 * A preset type's archive (docs/content-presets.md): each preset draws its own
 * layout from the same archive read. An unknown preset returns null and the
 * route draws the generic `ContentArchive`.
 */
export function PresetArchive({ archive, settings, query }: {
  archive: Archive;
  settings: SiteSettings;
  query: { type?: string; year?: string };
}): ReactNode {
  switch (archive.type.preset) {
    case "newsroom_releases": return <NewsroomArchive archive={archive} settings={settings} />;
    case "newsroom_coverage": return <CoverageArchive archive={archive} />;
    case "investors": return <InvestorsArchive archive={archive} settings={settings} query={query} />;
    case "testimonials": return <TestimonialsArchive archive={archive} />;
    case "awards": return <AwardsArchive archive={archive} />;
    default: return null;
  }
}
