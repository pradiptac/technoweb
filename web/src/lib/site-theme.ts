import { DEFAULT_THEME_ID, manifestById } from "@/themes/manifests";

/**
 * Which theme the site renders — one pure function, safe on either side of
 * the boundary, with every way of being wrong landing on `classic`.
 *
 * The order: `SITE_THEME` in the environment wins over the stored setting.
 * That is the kill switch — a theme misbehaving in production is turned off
 * by one line in the runtime environment, with no console login and no
 * database edit — and it is what the audit matrix uses to run one server
 * per theme without touching the settings (a `PATCH` from a script does not
 * `updateTag("settings")`, so the site would go on rendering the old value
 * for the revalidate window anyway). Three caveats belong with it, and are
 * in `docs/themes.md`: it is process-wide; index pages are prerendered at
 * **build**, so for `next start` it belongs in the build environment like
 * `API_BASE_URL`; and the ISR cache survives a restart, so a matrix run
 * wants a fresh `.next` per theme.
 *
 * An id the manifests do not know — a typo, a theme removed in a deploy, a
 * value written before the theme it names existed — is `classic`, warned
 * once per process rather than on every render. The API checks the shape of
 * the id and nothing more (`SettingController::validateSiteTheme`), so this
 * is the only place the list is consulted.
 */
const warned = new Set<string>();

export function siteThemeId(settings: Record<string, string | undefined>): string {
  const override = typeof process !== "undefined" ? process.env.SITE_THEME?.trim() : undefined;
  const wanted = override || settings.site_theme?.trim() || DEFAULT_THEME_ID;

  if (manifestById(wanted)) return wanted;

  if (!warned.has(wanted)) {
    warned.add(wanted);
    console.warn(`[themes] no theme is registered as "${wanted}"; rendering "${DEFAULT_THEME_ID}"`);
  }

  return DEFAULT_THEME_ID;
}

/** Whether the environment, not the setting, is deciding — the console says so. */
export function siteThemeOverridden(): boolean {
  return Boolean(typeof process !== "undefined" && process.env.SITE_THEME?.trim());
}
