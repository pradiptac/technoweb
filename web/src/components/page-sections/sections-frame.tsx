import type { ReactNode } from "react";
import { activeTheme } from "@/themes";

/**
 * A builder page's sections drawn inside the console exactly as the public
 * site draws them — the content blocks' `PreviewFrame` recipe: the public
 * wrapper (`.public-site` with the active theme's `data-theme`), so the 12px
 * floor, the card grounds and the theme's own rules all apply, and
 * `data-reveal-static`, so the reveal observer leaves the sections visible
 * rather than waiting for a scroll that a dialog never makes.
 */
export async function SectionsFrame({ children }: { children: ReactNode }) {
  const theme = await activeTheme();

  return (
    <div className="public-site overflow-hidden rounded-xl border border-line-strong bg-page" data-theme={theme.manifest.id} data-reveal-static>
      {children}
    </div>
  );
}
