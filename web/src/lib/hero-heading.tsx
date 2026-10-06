import "server-only";
import { cache, type ReactNode } from "react";

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
export function HeroTitle({ className, children }: { className?: string; children: ReactNode }) {
  const Tag = store().level;
  return <Tag className={className}>{children}</Tag>;
}
