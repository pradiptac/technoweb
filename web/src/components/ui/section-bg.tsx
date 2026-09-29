import Image from "next/image";
import type { ReactNode } from "react";
import { focalStyle } from "@/lib/focal";
import { sectionReveal } from "@/lib/motion-choices";
import { themeFor } from "@/lib/presets";
import { sectionSurface, type Seeds } from "@/lib/section-background";
import type { SiteSettings } from "@/lib/site-settings";
import { expand } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { LOCKED_SECTION, type SectionBackground, type ThemeOptions } from "@/themes/options";

/**
 * The shell a homepage section renders inside when the theme options give
 * it a background of its own — and nothing at all when they do not.
 *
 * `bg` undefined returns the children untouched: no wrapper, no attribute,
 * no style. That is what keeps a site nobody has customised byte-identical
 * to the site before this existed, and it is why the shell is a wrapper
 * *around* each section rather than a prop into it — nine sections keep
 * their markup and their own `bg-*` classes, and the local tokens the shell
 * sets (`lib/section-background.ts`) are what those classes now resolve to.
 *
 * A picture is `next/image` filling the shell at the overlay's opacity,
 * `sizes="100vw"`, `alt=""` — decoration under words that already say what
 * the section is. Lazy, **except on the first two sections of the page**:
 * a ground picture under the section beneath the hero is the largest thing
 * painted at every ordinary viewport, and lazy there is Next's LCP warning,
 * which `npm run audit` fails on (found 2026-09-21 on a dev database with a
 * picture on the second section). `eager`, never `priority` — the grids'
 * rule; `HomeSection` decides from the section's position in the order.
 * The shell is `relative overflow-hidden` so the picture clips to it, and
 * the content sits on a `relative` layer above.
 * `seeds` are the three ramps' `600`s, which `ramp()` needs to derive the
 * coloured-text inks that read on the new ground.
 */
export function SectionBg({
  id, bg, seeds, className, eager = false, children,
}: {
  id: string;
  bg: SectionBackground | undefined;
  seeds: Seeds;
  className?: string;
  /** Load the picture eagerly — the first sections of a page, where it is the largest paint. */
  eager?: boolean;
  children: ReactNode;
}) {
  if (!bg) return <>{children}</>;

  const surface = sectionSurface(bg, seeds);

  return (
    <div data-section={id} data-ground={surface.ground} style={surface.style} className={cn("relative overflow-hidden", className)}>
      {bg.kind === "image" && bg.image_url && (
        <Image
          src={bg.image_url}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          loading={eager ? "eager" : undefined}
          className="object-cover"
          style={{ opacity: surface.imageOpacity, ...focalStyle(bg.image_focus) }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** The three ramps' `600`s for the palette the settings choose — what every `SectionBg` on a page needs. */
export function homeSeeds(settings: SiteSettings): Seeds {
  const palette = themeFor(settings);
  const companions = expand(palette, "light");
  return { brand: palette.colors.brand600, secondary: companions.secondary[600], accent: companions.accent[600] };
}

/**
 * One homepage section keyed into the options' `sections`; hoisted so a
 * `Home` is not defining a component per render. `index` is the section's
 * position in the rendered order; the first two are above the fold and
 * load their picture eagerly.
 */
export function HomeSection({ id, index, sections, seeds, children }: { id: string; index?: number; sections: ThemeOptions["sections"]; seeds: Seeds; children: ReactNode }) {
  // A homepage section does not move unless the Themes screen says so; when it
  // does, the content arrives inside a still band, as it does on inner pages.
  // No choice, no wrapper: the markup is what it was.
  // The hero is the first paint and never animates, whatever a row says.
  const reveal = id === LOCKED_SECTION ? null : sectionReveal(sections[id]?.reveal, null);
  return (
    <SectionBg id={id} bg={sections[id]?.bg} seeds={seeds} eager={index !== undefined && index <= 1}>
      {reveal ? <div data-aos={reveal}>{children}</div> : children}
    </SectionBg>
  );
}
