import Image from "next/image";
import type { ReactNode } from "react";
import { themeFor } from "@/lib/presets";
import { sectionSurface, type Seeds } from "@/lib/section-background";
import type { SiteSettings } from "@/lib/site-settings";
import { expand } from "@/lib/themes";
import { cn } from "@/lib/utils";
import type { SectionBackground, ThemeOptions } from "@/themes/options";

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
 * lazy, `sizes="100vw"`, `alt=""` — decoration under words that already say
 * what the section is. The shell is `relative overflow-hidden` so the
 * picture clips to it, and the content sits on a `relative` layer above.
 * `seeds` are the three ramps' `600`s, which `ramp()` needs to derive the
 * coloured-text inks that read on the new ground.
 */
export function SectionBg({
  id, bg, seeds, className, children,
}: {
  id: string;
  bg: SectionBackground | undefined;
  seeds: Seeds;
  className?: string;
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
          className="object-cover"
          style={{ opacity: surface.imageOpacity }}
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

/** One homepage section keyed into the options' `sections`; hoisted so a `Home` is not defining a component per render. */
export function HomeSection({ id, sections, seeds, children }: { id: string; sections: ThemeOptions["sections"]; seeds: Seeds; children: ReactNode }) {
  return <SectionBg id={id} bg={sections[id]?.bg} seeds={seeds}>{children}</SectionBg>;
}
