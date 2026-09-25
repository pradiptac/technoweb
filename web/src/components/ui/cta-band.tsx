import type { BackdropVariant } from "@/components/ui/backdrop";
import { CtaBlock } from "@/components/blocks/cta-block";
import { ThemeBand } from "@/components/ui/theme-band";
import { publicApi } from "@/lib/api";

/**
 * The closing band on twenty-three public pages, the homepage included —
 * the site's default CTA banner when one is chosen in the console.
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
  /*
    The site's default CTA banner (2026-09-24), chosen in the console. None
    chosen, or the API unreachable, is the band exactly as it was — the
    theme's own words — so the default is additive and a dead API cannot
    take the foot of every page with it.

    A page that passes its own `title`/`body` ("Thinking about firewalls?")
    keeps them; the kicker, the buttons and the layout come from the
    default. A `band` default is drawn by the theme; any other layout by
    `CtaBlock`, on the page's own spacing.
  */
  const fallback = await publicApi.defaultCta().then((r) => r.data).catch(() => null);
  if (!fallback || fallback.type !== "cta") return <ThemeBand {...props} />;

  if (fallback.layout !== "band") {
    return <CtaBlock block={fallback} override={{ heading: props.title, body: props.body }} className={props.className} />;
  }

  const c = fallback.content;
  const secondary = c.secondary_mode === "none"
    ? null
    : c.secondary_mode === "link" && c.secondary?.label && c.secondary?.href
      ? { label: c.secondary.label, href: c.secondary.href }
      : undefined;

  return (
    <ThemeBand
      {...props}
      title={props.title ?? c.heading}
      body={props.body ?? c.body ?? undefined}
      kicker={c.kicker ?? undefined}
      primary={c.primary ?? undefined}
      secondary={secondary}
    />
  );
}
