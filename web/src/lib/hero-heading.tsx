import "server-only";
import { cache, type ReactNode } from "react";
import { getSiteSettings } from "@/lib/settings";
import { kineticFor } from "@/lib/kinetic";
import { KineticText } from "@/components/ui/kinetic-text";

/**
 * The level a homepage hero's heading renders at, per request (0.113.0).
 *
 * Every theme's homepage hero is its page's one `h1`. A builder page's
 * `theme_section` can now draw that same hero inside a context that already
 * has its `h1` — the console's previews, where `PageSections` runs with
 * `ownsH1={false}` — and there the hero has to step down to an `h2` or the
 * screen carries two, which the audit fails. Threading a prop through every
 * theme's `Home` for one section would put the console's concern into a
 * dozen templates; instead `PageSections` says so once, here, before its
 * children render, and each hero reads it through `HeroTitle`.
 *
 * `cache()` is what makes it per request rather than per process: a module
 * variable would leak an `h2` from one console preview into the next public
 * render on the same server. Nothing sets it, nothing changes — the default
 * is `h1`, so the homepage itself is untouched.
 */
type HeroLevel = "h1" | "h2";

const store = cache((): { level: HeroLevel } => ({ level: "h1" }));

/** Set before the heroes render — the caller's body, never a child's. */
export function setHeroLevel(level: HeroLevel): void {
  store().level = level;
}

/** The level for this request, for a hero that renders its heading through another component (`as`). */
export function heroLevel(): HeroLevel {
  return store().level;
}

/** A homepage hero's heading, at this request's level; the classes are the caller's, unchanged. */
export async function HeroTitle({ className, children, text, lastWordClassName }: {
  className?: string;
  children: ReactNode;
  /**
   * The heading as one string, for a hero whose children split it up (the
   * classic hero colours its last word, which `lastWordClassName` keeps).
   * A plain string child is used as it is.
   */
  text?: string;
  lastWordClassName?: string;
}) {
  const Tag = store().level;
  const words = text ?? (typeof children === "string" ? children : null);
  if (words) {
    // The homepage hero's effect (0.171.0): `hero_kinetic`, or Motion → Hero
    // heading under `default`. Resolved here so no theme threads a prop.
    const s = await getSiteSettings();
    const k = kineticFor(s.motion_headline, s.hero_kinetic, s.hero_kinetic_words);
    if (k.effect !== "none") {
      const id = "k-hero-title";
      return (
        <Tag className={className} aria-labelledby={k.effect === "rotate" ? id : undefined}>
          <KineticText text={words} effect={k.effect} words={k.words} id={id} lastWordClassName={lastWordClassName} />
        </Tag>
      );
    }
  }
  return <Tag className={className}>{children}</Tag>;
}
