import { existsSync } from "node:fs";
import { join } from "node:path";
import { MANIFESTS, DEFAULT_THEME_ID } from "../src/themes/manifests.ts";
import { HEADER_PART_IDS, FOOTER_PART_IDS, arrange, resolveFooter, resolveHeader } from "../src/themes/chrome-parts.ts";

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
 *   - a header or footer declaration (0.160.0) that names a part the API does
 *     not know, a group of parts the theme does not draw, a part in two groups,
 *     or a default that does not reproduce "every part the theme draws, bar `off`"
 *     with nothing moved;
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

for (const m of MANIFESTS) {
  for (const [which, ids, side] of [["header", HEADER_PART_IDS, m.chrome.header], ["footer", FOOTER_PART_IDS, m.chrome.footer]]) {
    const drawn = new Set(side.parts);
    if (drawn.size !== side.parts.length) fail(`${m.id}: ${which} lists a part twice`);
    for (const id of side.parts) if (!ids.includes(id)) fail(`${m.id}: ${which} part "${id}" is not one the API knows`);
    for (const id of side.off ?? []) if (!drawn.has(id)) fail(`${m.id}: ${which} is off by default for "${id}", which it does not draw`);
    const grouped = new Set();
    for (const g of side.groups ?? []) {
      if (g.length < 2) fail(`${m.id}: a ${which} group of one part cannot move`);
      for (const id of g) {
        if (!drawn.has(id)) fail(`${m.id}: ${which} group names "${id}", which it does not draw`);
        if (grouped.has(id)) fail(`${m.id}: ${which} part "${id}" is in two groups`);
        grouped.add(id);
      }
    }
    // The default is the chrome as it was: everything drawn is shown (bar off), nothing is reordered.
    const r = which === "header" ? resolveHeader(side, { parts: {}, order: [] }) : resolveFooter(side, { parts: {}, order: [] });
    for (const id of ids) {
      if (r.show[id] !== (drawn.has(id) && !side.off?.includes(id))) fail(`${m.id}: ${which} default for "${id}" is wrong`);
    }
    if (r.order.join() !== (side.groups ?? []).flat().join()) fail(`${m.id}: ${which} default order moved`);
    // A stored order reverses each group, and arrange() draws the reversed order.
    const flipped = (side.groups ?? []).flatMap((g) => [...g].reverse());
    const moved = which === "header" ? resolveHeader(side, { parts: {}, order: flipped }) : resolveFooter(side, { parts: {}, order: flipped });
    if (moved.order.join() !== flipped.join()) fail(`${m.id}: ${which} stored order is not applied`);
    for (const g of side.groups ?? []) {
      const shown = g.filter((id) => moved.show[id]);
      const drawnOrder = arrange(moved, g.map((id) => [id, id])).map(([id]) => id);
      if (drawnOrder.join() !== [...shown].reverse().join()) fail(`${m.id}: ${which} group ${g.join("/")} is not drawn in the stored order`);
    }
  }
}

ok(`${MANIFESTS.length} theme(s): ${[...ids].join(", ")}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nThe registry is consistent");
process.exit(failed ? 1 : 0);
