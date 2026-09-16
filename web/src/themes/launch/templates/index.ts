import type { ThemeTemplates } from "@/themes/contract";
import { Chrome } from "./chrome";
import { CtaBand } from "./cta-band";
import { Home } from "./home";
import { PageHero } from "./page-hero";

/** What `themes/index.ts` lazily imports for `launch`. */
export const templates: ThemeTemplates = { Chrome, Home, PageHero, CtaBand };
