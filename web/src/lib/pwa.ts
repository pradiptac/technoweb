import { settingEnabled, type SiteSettings } from "@/lib/site-settings";

/**
 * The installable website's settings, resolved (Site → Settings →
 * Installable app, `pwa_*`, 2026-10-05). Pure, so the manifest, the icon
 * route and the layout read one answer.
 *
 * Every field falls back rather than failing: blank names take the company's,
 * a blank icon is drawn from its initials, and an unset switch is on — the
 * seeded default — because a setting the API has not been taught to return
 * yet must not silently remove a feature.
 */
export type PwaConfig = {
  enabled: boolean;
  /** Offer the install card (the browser's own install button works regardless). */
  prompt: boolean;
  name: string;
  shortName: string;
  /** An uploaded square icon, or null to draw one. */
  iconUrl: string | null;
};

export function pwaFor(settings: SiteSettings, company: string): PwaConfig {
  const name = (settings.pwa_name ?? "").trim() || (settings.company_name ?? "").trim() || company;
  const short = (settings.pwa_short_name ?? "").trim();
  return {
    enabled: settingEnabled(settings, "pwa_enabled", true),
    prompt: settingEnabled(settings, "pwa_install_prompt", true),
    name,
    // A launcher cuts the name under an icon at about twelve characters; a
    // first word that fits reads better than a name cut mid-word.
    shortName: short || (name.length <= 12 ? name : (name.split(/\s+/)[0] ?? name).slice(0, 12)),
    iconUrl: settings.pwa_icon_url ?? null,
  };
}

/** "T" from "Technoware", "AI" from "Altis Infonet" — what the drawn icon says. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) {
    // One word: its first letter, and a second only where the name itself
    // has a capital inside it ("TechnoWare" → "TW"); "Technoware" → "T".
    const w = words[0];
    const capital = w.slice(1).match(/\p{Lu}/u)?.[0];
    return (w[0] + (capital ?? "")).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The sizes the manifest names. 192 and 512 are what Chrome asks for, 180 is
 * Apple's touch icon, and the maskable 512 keeps the mark inside the middle
 * 80% that every launcher's mask leaves visible.
 */
export const PWA_ICON_SIZES = [180, 192, 512] as const;

/**
 * Paths a service worker must never answer from a cache: anything signed in,
 * anything that pays or changes something, and the routes that hand out a
 * secret. Kept here so the worker's script and the tests read one list.
 */
export const PWA_NEVER_CACHE = [
  "/admin", "/portal", "/api", "/checkout", "/order", "/store/basket", "/store/notify",
  "/newsletter/unsubscribe", "/visit", "/meeting", "/ticket-survey", "/embed", "/theme-preview", "/push",
] as const;
