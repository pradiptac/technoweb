import type { ThemeManifest } from "../contract.ts";

/**
 * Horizon: the site as a hosting and cloud company presents itself.
 *
 * Modelled on i2k2.com (the client's reference, 2026-09-17): a white
 * ground with the palette's secondary and accent as the two "separator"
 * colours, the classic two-row header, a **full-width rotating banner**
 * for the hero — the slider when there is one, the theme's data-centre
 * picture with the words on an opaque panel otherwise — and then the
 * hosting company's sequence: four service cards with icons, a statistics
 * band on the secondary colour, the client logos, "why choose us" as a
 * bullet list beside a picture, two featured case studies, the
 * testimonial, the partner logos, three posts, and an **enquiry form on
 * the homepage** above the closing band. Manrope for display, Inter for
 * body. A child of `classic` (the header and footer are classic's); two
 * Freepik pictures under `public/themes/horizon/`.
 */
export const horizonManifest: ThemeManifest = {
  id: "horizon",
  name: "Horizon",
  blurb: "A hosting and cloud company: full-width rotating banner, four service cards with icons, a statistics band, why-choose-us bullets, an enquiry form on the front page.",
  screenshot: "/themes/horizon.jpg",
  extends: "classic",
  defaults: { menu_style: "semi", hero_style: "banner" },
};
