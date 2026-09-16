import { existsSync } from "node:fs";
import { join } from "node:path";
import { MANIFESTS, DEFAULT_THEME_ID } from "../src/themes/manifests.ts";

/**
 * The theme registry's consistency gate — `npm run themes:check`.
 *
 * Reads `src/themes/manifests.ts` (under `--experimental-strip-types`, the
 * way `theme-contrast.mjs` reads the palette) and refuses:
 *   - a duplicate id, or one that is not the shape the API accepts
 *     (`^[a-z][a-z0-9-]{1,31}$`, `SettingController::validateSiteTheme`);
 *   - an `extends` naming a theme that is not registered, or a chain that
 *     loops — the registry cuts both at render time and falls back to
 *     `classic`, so this is the place they are *seen* rather than survived;
 *   - a missing default;
 *   - a manifest whose screenshot is not under `public/` — a warning, not a
 *     failure, because `npm run theme-shots` writes them after the preview
 *     route is up and a fresh clone has none yet.
 */
let failed = 0;
const fail = (m) => { console.log(`FAIL ${m}`); failed++; };
const ok = (m) => console.log(`ok   ${m}`);
const ids = new Set();

for (const m of MANIFESTS) {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(m.id)) fail(`${m.id}: id is not the shape the API accepts`);
  if (ids.has(m.id)) fail(`${m.id}: registered twice`);
  ids.add(m.id);
}
if (!ids.has(DEFAULT_THEME_ID)) fail(`the default "${DEFAULT_THEME_ID}" is not registered`);

for (const m of MANIFESTS) {
  const seen = [m.id];
  let cur = m.extends;
  while (cur) {
    if (!ids.has(cur)) { fail(`${m.id}: extends "${cur}", which is not registered`); break; }
    if (seen.includes(cur)) { fail(`${m.id}: extends chain loops (${[...seen, cur].join(" → ")})`); break; }
    seen.push(cur);
    cur = MANIFESTS.find((x) => x.id === cur)?.extends;
  }
  if (seen.length > 3) fail(`${m.id}: extends chain is ${seen.length} deep; the registry stops at 3`);
  if (!existsSync(join("public", m.screenshot))) console.log(`note ${m.id}: no screenshot at public${m.screenshot} — run npm run theme-shots`);
}

ok(`${MANIFESTS.length} theme(s): ${[...ids].join(", ")}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nThe registry is consistent");
process.exit(failed ? 1 : 0);
