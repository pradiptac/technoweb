"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createPage } from "@/lib/admin";
import { getSiteSettings } from "@/lib/settings";
import { activeTheme } from "@/themes";
import { HOME_SECTIONS, orderSections, parseOptionsRow } from "@/themes/options";
import type { StoredSection } from "@/types/api";

export type HomepageState = { error?: string };

/** The block sections, drawn by the theme only once Site → Settings → Homepage chooses one. */
const BLOCK_SETTING: Record<string, string> = {
  stats_block: "home_stats_block",
  stack: "home_stack_block",
  pricing: "home_pricing_block",
};

/** The themes whose `services` slot is drawn at all (Enterprise and Horizon put their own section in `web`). */
const SERVICES_THEMES = new Set(["enterprise", "horizon"]);

/**
 * A section row's background, as the builder stores one: the Themes screen's
 * stored row less what is not a background — the switch, the reveal — and
 * less what the API derives on the way out (`image_url`, `image_focus`),
 * which is never stored. A row whose kind is the theme's own is no
 * background at all.
 */
function backgroundOf(row: Record<string, unknown> | undefined): StoredSection["background"] {
  if (!row || typeof row.kind !== "string" || row.kind === "default") return null;
  const bg: Record<string, unknown> = { ...row };
  for (const key of ["enabled", "reveal", "image_url", "image_focus"]) delete bg[key];
  return bg as StoredSection["background"];
}

/**
 * "New homepage from the theme" (0.113.0): a draft builder page holding the
 * homepage the active theme draws today — its sections, in the stored order
 * and set, each a `theme_section` carrying the background and reveal the
 * Themes screen gave it — so an editor starts from the page they already
 * know and changes it, rather than from nothing. Nothing is published and
 * nothing is pointed at `/`: that is Site → Settings → Homepage, once the
 * page is ready.
 *
 * The settings are the public map — the themes and homepage groups are both
 * public, and the Pages screen is a content manager's, which the admin
 * settings endpoint (`role:admin`) would refuse.
 */
// Takes neither the previous state nor the form's data: one press, nothing typed.
export async function createHomepageFromThemeAction(): Promise<HomepageState> {
  let id: number;

  try {
    const [theme, settings] = await Promise.all([activeTheme(), getSiteSettings()]);
    const stored = parseOptionsRow(settings.site_theme_options)[theme.manifest.id] ?? {};
    const rows = stored.sections && typeof stored.sections === "object" && !Array.isArray(stored.sections)
      ? (stored.sections as Record<string, Record<string, unknown>>)
      : {};

    const ids = orderSections(HOME_SECTIONS, theme.options)
      .map((s) => s.id)
      .filter((sid) => {
        const setting = BLOCK_SETTING[sid];
        if (setting) return Boolean(settings[setting]?.trim());
        if (sid === "services") return SERVICES_THEMES.has(theme.manifest.id);
        // Drawn only when a reviews snippet is pasted in Settings → Embeds.
        if (sid === "reviews") return Boolean(settings.reviews_embed?.trim());
        return true;
      });
    // The hero opens the page — the API refuses it anywhere else.
    const ordered = ["hero", ...ids.filter((sid) => sid !== "hero")];

    const blocks: StoredSection[] = ordered.map((sid) => {
      const row = rows[sid] && typeof rows[sid] === "object" ? rows[sid] : undefined;
      const reveal = typeof row?.reveal === "string" && row.reveal ? row.reveal : null;
      return {
        id: crypto.randomUUID(),
        type: "theme_section",
        hidden: false,
        background: backgroundOf(row),
        reveal,
        data: { section: sid },
      };
    });

    // No slug: the API derives one from the title — `home`, or `home-2`
    // when that is taken — rather than refusing a slug somebody else holds.
    const page = await createPage({ title: "Home", template: "builder", status: "draft", blocks });
    id = page.id;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Your account cannot create pages." };
      if (error.status === 422) {
        const first = Object.values(error.errors ?? {})[0]?.[0];
        return { error: first ? `The page could not be made: ${first}` : "The page could not be made from the theme." };
      }
    }
    return { error: "We could not make the page. Try again shortly." };
  }

  updateTag("pages");
  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${id}?tab=builder`);
}
