import type { ThemeTemplates } from "@/themes/contract";
import { Chrome } from "./chrome";
import { Home } from "./home";
import { PageHero } from "./page-hero";

/**
 * What `themes/index.ts` lazily imports for `atelier`.
 *
 * No `CtaBand`: the classic band is already a dark slab with the words
 * centred on it, which is exactly what a printed page closes with, and
 * Atelier's `theme.css` squares its corners. A theme fills the slots it
 * changes and inherits the rest — the registry's loaders accept a partial.
 */
export const templates: Partial<ThemeTemplates> = { Chrome, Home, PageHero };
