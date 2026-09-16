import "server-only";
import { cache } from "react";
import { getSiteSettings } from "@/lib/settings";
import { siteThemeId } from "@/lib/site-theme";
import type { Theme, ThemeTemplates } from "./contract";
import { DEFAULT_THEME_ID, manifestById } from "./manifests";

/**
 * The theme registry, and the one place a theme's components are loaded.
 *
 * **Server-only.** A client component that needs a theme's *name* imports
 * `./manifests`; one that needs the *id* imports `lib/site-theme`; nothing
 * on the client side imports this file, or `server-only` throws at build —
 * which is the point of it, since a registry of server components reached
 * from a client module is the `lib/settings.ts` 500 in a new coat.
 *
 * ## Why the loaders are lazy, and why they are literals
 *
 * Next builds a segment's client chunk from every `"use client"` module
 * *reachable in its server module graph*, not from what rendered — that is
 * the `IconField` lesson in CLAUDE.md, where a server-rendered picker still
 * had to go through `next/dynamic` to become its own chunk. Five statically
 * imported themes would put five headers' worth of client islands into the
 * marketing layout's chunk for every visitor. Dynamically importing a
 * *server* component lazy-loads only the client components under it, so
 * each theme is a literal `() => import("./<id>/templates")` — literal,
 * because Turbopack cannot analyse a template-string path, and a path it
 * cannot analyse is a chunk it cannot make.
 *
 * ## Resolution
 *
 * `resolveTheme(id)` walks the manifest's `extends` chain root-first (depth
 * cap 3, cycle guard), awaits each loader and overlays the templates, so a
 * child theme fills only the slots it changes. Everything that can go wrong
 * lands on `classic`: an id with no loader, a loader that throws (a theme
 * half-deployed, a syntax error in one file), a chain that loops. The site
 * can never render without a theme, and never renders a broken one in
 * preference to the one that works.
 *
 * `activeTheme()` is wrapped in React's `cache()`, so the thirty `PageHero`
 * and `CtaBand` dispatchers on a page resolve once per request; it reads
 * the preview store first (see `forcePreviewTheme`) and the settings second.
 */
const LOADERS: Record<string, () => Promise<{ templates: ThemeTemplates }>> = {
  classic: () => import("./classic/templates"),
  editorial: () => import("./editorial/templates"),
  datacenter: () => import("./datacenter/templates"),
};

const MAX_CHAIN = 3;

async function loadTemplates(id: string): Promise<ThemeTemplates | null> {
  const loader = LOADERS[id];
  if (!loader) {
    console.warn(`[themes] "${id}" is in the manifests but has no loader`);
    return null;
  }
  try {
    return (await loader()).templates;
  } catch (error) {
    console.warn(`[themes] "${id}" failed to load; rendering "${DEFAULT_THEME_ID}"`, error);
    return null;
  }
}

/** The `extends` chain for an id, root first, cycles and unknown parents cut. */
function chainFor(id: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = id;
  while (current && chain.length < MAX_CHAIN && !chain.includes(current)) {
    const manifest = manifestById(current);
    if (!manifest) break;
    chain.unshift(current);
    current = manifest.extends;
  }
  return chain;
}

export async function resolveTheme(id: string): Promise<Theme> {
  const chain = chainFor(id);
  const layers = await Promise.all(chain.map(loadTemplates));
  const manifest = manifestById(id);

  // The root of the chain must load, or nothing below it is whole.
  if (!manifest || layers.length === 0 || layers[0] === null) {
    if (id === DEFAULT_THEME_ID) throw new Error(`[themes] the default theme "${DEFAULT_THEME_ID}" cannot load`);
    return resolveTheme(DEFAULT_THEME_ID);
  }

  const templates = Object.assign({}, ...layers.filter((l): l is ThemeTemplates => l !== null)) as ThemeTemplates;
  return { manifest, templates };
}

/**
 * The preview override — one request's worth of "render this theme instead".
 *
 * `cache()` gives a store scoped to the request, so the preview page can name
 * a theme before it renders anything and every dispatcher underneath sees
 * it, while a visitor's request on the real site, which never calls
 * `forcePreviewTheme`, sees nothing. A cookie or a header would have made
 * every cached page dynamic; this makes nothing dynamic that was not.
 *
 * It must be called **before the first `await` after `params`** in the
 * preview page, and never from a layout: Next renders a layout and its page
 * as separate segments, so a page's `activeTheme()` can run before a
 * layout's override is set.
 */
const previewStore = cache(() => ({ id: null as string | null }));

export function forcePreviewTheme(id: string): void {
  previewStore().id = manifestById(id) ? id : DEFAULT_THEME_ID;
}

export const activeTheme = cache(async (): Promise<Theme> => {
  const forced = previewStore().id;
  if (forced) return resolveTheme(forced);

  const settings = await getSiteSettings();
  return resolveTheme(siteThemeId(settings));
});
