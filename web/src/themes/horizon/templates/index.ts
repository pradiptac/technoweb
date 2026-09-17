import type { ThemeTemplates } from "@/themes/contract";
import { CtaBand } from "./cta-band";
import { Home } from "./home";

/**
 * What `themes/index.ts` lazily imports for `horizon`. `Chrome` and
 * `PageHero` are classic's through `extends`: the two-row header and the
 * banner hero with the section's picture are exactly the reference's.
 */
export const templates: Partial<ThemeTemplates> = { Home, CtaBand };
