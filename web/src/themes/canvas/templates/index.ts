import type { ThemeTemplates } from "@/themes/contract";
import { CtaBand } from "./cta-band";
import { Home } from "./home";

/**
 * What `themes/index.ts` lazily imports for `canvas`. `Chrome` and `PageHero`
 * are classic's through `extends` — the header on the canvas and the split
 * hero (the default `hero_style` here) are the document's `top-nav` and
 * `hero-band` already.
 */
export const templates: Partial<ThemeTemplates> = { Home, CtaBand };
