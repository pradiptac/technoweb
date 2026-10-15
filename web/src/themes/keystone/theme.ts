import type { ThemeManifest } from "../contract.ts";
import { oneRowHeader, BRAND_FOOTER } from "../chrome-parts.ts";

/**
 * Keystone: the enterprise platform's site, after truenas.com.
 *
 * The twelfth theme (2026-09-18). What the reference is made of: a white
 * page with a header whose sections sit inside one bordered pill and whose
 * two calls sit beside it as pills of their own; a centred, heavy headline
 * whose closing words run through a brand-to-accent gradient; the product
 * shown big under it in a glowing frame — here the slider, or the NOC
 * panel; a tab strip that walks the solutions one at a time beside a
 * photograph; a partner band on the brand wash; a full-bleed brand band
 * carrying one white rounded card with the customer's words and the
 * credentials; a dark rounded closing card. Red Hat Display for the
 * display at 700, DM Sans for the body. Two Freepik photographs under
 * `public/themes/keystone/`.
 */
export const keystoneManifest: ThemeManifest = {
  id: "keystone",
  name: "Keystone",
  blurb: "An enterprise platform: pill nav groups, a heavy centred headline with a gradient close, the product big in a glowing frame, a brand band with a white card.",
  screenshot: "/themes/keystone.jpg",
  // Every inner page opens centred on the page ground with the banner framed under the words.
  ignores: ["hero_style"],
  defaults: { menu_style: "semi" },
  chrome: { header: oneRowHeader(["search", "phone", "cta", "utility"]), footer: { ...BRAND_FOOTER, groups: [["tagline", "address"]] } },
};
