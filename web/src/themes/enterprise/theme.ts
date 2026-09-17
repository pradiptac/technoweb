import type { ThemeManifest } from "../contract.ts";

/**
 * Enterprise: the site as a large IT-services company presents itself.
 *
 * Modelled on inspirisys.com (the client's reference, 2026-09-17): a white
 * corporate ground with the brand's deep steps for the bands, the classic
 * two-row header (a utility strip, then the navigation), no photographic
 * hero — a short navy statement band with the slider or a boardroom
 * picture beside it — and then the page as a *sequence of proof*: the
 * awards and certifications as a strip, three showcase cards with
 * pictures, the services as **tabs** with a picture and a paragraph per
 * tab, the partners, the case studies as a masonry-ish grid, the posts.
 * Inter for everything, as that site has; tight leading; square-ish cards
 * with a top rule in the brand.
 *
 * The first theme built as a **child**: `extends: "classic"`, so the
 * classic `Chrome` — the header with its utility strip and the footer —
 * is inherited and only the three page slots are this folder's. Two
 * Freepik pictures under `public/themes/enterprise/`.
 */
export const enterpriseManifest: ThemeManifest = {
  id: "enterprise",
  name: "Enterprise",
  blurb: "A large IT-services company: white corporate ground, a navy statement band, awards strip, showcase cards, the services as tabs, case studies as a grid.",
  screenshot: "/themes/enterprise.jpg",
  extends: "classic",
  defaults: { menu_style: "mega", hero_style: "compact" },
};
