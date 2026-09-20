import type { ThemeTemplates } from "@/themes/contract";
import { CtaBand } from "./cta-band";
import { Home } from "./home";
import { PageHero } from "./page-hero";

/**
 * What `themes/index.ts` lazily imports for `enterprise`. `Chrome` is
 * absent on purpose: the manifest `extends: "classic"`, and the resolver
 * overlays these three slots on classic's four — the first child theme.
 */
export const templates: Partial<ThemeTemplates> = { Home, PageHero, CtaBand };
