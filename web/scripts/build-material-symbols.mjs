/**
 * Material Symbols Rounded, weight 300, unfilled (Apache-2.0, Google) as
 * {name: pathData}, for server code only (0.179.0, docs/icons.md).
 *
 * Names over 37 characters are left out: a key is `ms:<name>` in a
 * varchar(40) column. An icon drawn as several paths is joined into one
 * (every Material Symbol is a single filled shape, so the join is a no-op
 * for nearly all of them and the safe reading for the rest).
 *
 *   node scripts/build-material-symbols.mjs [--check]
 *
 * `--check` fails when the committed file differs from what the installed
 * package produces, the way `build-help.mjs --check` does.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dir = join(dirname(require.resolve("@material-symbols/svg-300/package.json")), "rounded");
const out = {};

for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith(".svg") || file.endsWith("-fill.svg")) continue;

  const name = file.slice(0, -4);
  if (!/^[a-z0-9_]{1,37}$/.test(name)) continue;

  const paths = [...readFileSync(join(dir, file), "utf8").matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length) out[name] = paths.join(" ");
}

const json = JSON.stringify(out);
const target = new URL("../src/content/material-symbols.json", import.meta.url);

if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(target, "utf8"); } catch { /* absent counts as stale */ }
  const same = current === json;
  console.log(same ? "material-symbols.json is current." : "material-symbols.json is stale — run the script.");
  process.exit(same ? 0 : 1);
}

writeFileSync(target, json);
console.log(`Wrote ${Object.keys(out).length} icons.`);
