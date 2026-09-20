import type { BackdropVariant } from "@/components/ui/backdrop";
import { contact } from "@/content/site";
import { getSiteSettings } from "@/lib/settings";
import { activeTheme } from "@/themes";

/**
 * The closing band on twenty-three public pages, the homepage included.
 *
 * A dispatcher since 2026-09-16: the pages keep this import and the active
 * theme decides what the band looks like. The telephone number is resolved
 * here, once, and handed down — it is the site's, not `content/site.ts`'s,
 * whose constant is the seeded placeholder on the must-not-ship list;
 * `?? contact.phone` is for an install whose setting is unset, the same
 * fallback `site-header.tsx` uses. Classic's template, with the design
 * notes, is `themes/classic/templates/cta-band.tsx`.
 */
export async function CtaBand(props: {
  title?: string;
  body?: string;
  /**
   * `accent` is the band on the inner pages; `brand` is the homepage's
   * closer, which used to be its own `FinalCta` — a drifted copy of this
   * component with the other ramp, a larger heading and no `Backdrop`.
   */
  tone?: "accent" | "brand";
  /** `lg` is the homepage's display-2 heading and taller padding. */
  size?: "md" | "lg";
  /** The `motion_hero` decoration; the homepage passes the setting through. */
  backdrop?: BackdropVariant;
  /** On the `<section>` — the homepage overrides `section-y` with a bottom-only padding. */
  className?: string;
}) {
  const [theme, settings] = await Promise.all([activeTheme(), getSiteSettings()]);
  const Band = theme.templates.CtaBand;

  return <Band {...props} phone={settings.phone ?? contact.phone} options={theme.options} />;
}
