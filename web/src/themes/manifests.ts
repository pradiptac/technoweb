import type { ThemeManifest } from "./contract.ts";
import { classicManifest } from "./classic/theme.ts";
import { editorialManifest } from "./editorial/theme.ts";
import { datacenterManifest } from "./datacenter/theme.ts";
import { launchManifest } from "./launch/theme.ts";
import { terminalManifest } from "./terminal/theme.ts";
import { enterpriseManifest } from "./enterprise/theme.ts";
import { summitManifest } from "./summit/theme.ts";
import { horizonManifest } from "./horizon/theme.ts";
import { canvasManifest } from "./canvas/theme.ts";

/**
 * Every theme the site knows, as data.
 *
 * Pure data and nothing else — no component, no `import()` — so the console's
 * gallery (a client component) can list themes without pulling the registry
 * over the boundary. The registry proper is `./index.ts`, which is
 * `server-only`; a client file that needs a theme's *name* imports this, and
 * one that needs its *templates* has taken a wrong turn.
 *
 * The order here is the order of the gallery. `classic` is first and is the
 * default: it is the site as it was before themes existed, and every
 * fallback in `lib/site-theme.ts` lands on it.
 */
export const MANIFESTS: readonly ThemeManifest[] = [classicManifest, editorialManifest, datacenterManifest, launchManifest, terminalManifest, enterpriseManifest, summitManifest, horizonManifest, canvasManifest];

export const DEFAULT_THEME_ID = "classic";

export function manifestById(id: string): ThemeManifest | undefined {
  return MANIFESTS.find((m) => m.id === id);
}
