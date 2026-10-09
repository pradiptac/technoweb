import { settingEnabled, type SiteSettings } from "@/lib/site-settings";
import type { VideoShape } from "@/types/store-merch";

/**
 * How "shop the videos" is configured (0.140.0, Store → Product videos),
 * read from the public settings map. Pure — no fetching — so the server
 * shelf, the homepage helper and a builder section all ask it the same
 * questions, and a client island can take the result as props.
 *
 * Settings are strings, so every switch goes through `settingEnabled()`; a
 * shape outside the list falls back to portrait rather than breaking the
 * row, the rule every stored choice here follows.
 */
export type VideoShelfConfig = {
  shape: VideoShape;
  /** Play silently when on screen — contacts YouTube without a press, so it waits for consent where a banner is in use. */
  autoplay: boolean;
  showSku: boolean;
  /**
   * Whether the cookie banner is in use on this site, i.e. whether autoplay
   * has a visitor's answer to wait for. Exactly the layout's own condition
   * for drawing the banner — a banner that is never shown can never be
   * answered, and autoplay waiting on it would never start.
   */
  consentGated: boolean;
  heading: string;
  lede: string;
  /** The count the row asks the API for. */
  limit: number;
};

const SHAPES: readonly VideoShape[] = ["portrait", "square", "landscape"];

export function videoShelfConfig(settings: SiteSettings): VideoShelfConfig {
  const shape = settings.store_videos_shape as VideoShape;
  const limit = parseInt(settings.store_videos_limit ?? "12", 10);

  return {
    shape: SHAPES.includes(shape) ? shape : "portrait",
    autoplay: settingEnabled(settings, "store_videos_autoplay", false),
    showSku: settingEnabled(settings, "store_videos_show_sku", true),
    consentGated:
      settings.cookie_consent_enabled === "1"
      && Boolean(settings.google_analytics_id || settings.google_tag_manager_id || settings.meta_pixel_id),
    heading: settings.store_videos_heading?.trim() || "Shop the videos",
    lede: settings.store_videos_lede?.trim() || "",
    limit: Number.isFinite(limit) ? Math.max(4, Math.min(24, limit)) : 12,
  };
}

/** Where each placement is switched on or off. The shop front and the product page default to on, the homepage to off. */
export const videoShelfEnabled = {
  shop: (s: SiteSettings) => settingEnabled(s, "store_videos_shop_enabled", true),
  product: (s: SiteSettings) => settingEnabled(s, "store_videos_product_enabled", true),
  productOthers: (s: SiteSettings) => settingEnabled(s, "store_videos_product_others", true),
  home: (s: SiteSettings) => settingEnabled(s, "store_videos_home_enabled", false),
};
