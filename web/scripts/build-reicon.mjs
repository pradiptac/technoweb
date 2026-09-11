/**
 * Vendor a curated set of Reicon outline icons into `src/components/icons.tsx`.
 *
 *   node scripts/build-reicon.mjs > src/components/icons/reicon.generated.tsx
 *
 * ## Vendored, never depended on
 *
 * The same call the PIN-code table and the other four icon packs make: this
 * fetches once, the output is committed, and nothing is installed at runtime.
 * `reicon` on npm ships JavaScript modules rather than SVG files, so depending
 * on it would put 5,360 files in `node_modules` to draw fifty glyphs — and a
 * future version could change what an icon looks like underneath a record that
 * already points at it.
 *
 * ## Why four out of 2,630
 *
 * `CLAUDE.md` states the rule: *"Do not re-export the library wholesale: an
 * editor handed 1,600 icons cannot find any of them."* 127 keys are registered
 * today and an editor has chosen 27 of them, so **the question is which subject
 * is missing**, not how many icons a pack holds. Read against that map, Reicon
 * answers four: `ram`, `password`, `bluetooth` and `legal`.
 *
 * Everything else considered was already covered, usually by a better name.
 * `simcard` is `sim`, `headphone` is `headset`, `cpu-charge` is `cpu`,
 * `external-drive` is `disk`, `electricity` is `power`, `lightbulb` is `idea`,
 * `teacher` is `education`, `sitemap` is `network`, `scan-barcode` is
 * `barcode`. That is the same curve the four packs before it produced — sixteen
 * from 982, then ten from Tabler's 5,130 — and it is the finding rather than a
 * shortfall.
 *
 * **`lab` was the fifth and was dropped after rendering it**, which is the only
 * check that could have caught either half of why. `Microscope` is stroked and
 * passes everything below, and at 20px it reads as a *telescope* — an angled
 * tube on a tripod — which is the wrong subject rather than a rough one. And
 * every alternative Reicon holds is a filled outline: `Flask`, `TestTube`,
 * `TestTube2`, `Atom` and `Dna` are all `fill="currentColor"` with no stroke.
 * So the pack has no laboratory glyph this set can wear, and the key is not
 * registered rather than registered badly — a subject an editor picks and gets
 * a telescope for is worse than one that is not offered.
 *
 * ## Outline only, and Reicon's outline weight is mixed
 *
 * `base` sets `fill: none`, so an icon that is `fill="currentColor"` with no
 * stroke renders as **nothing at all** — on a screen where a missing icon is
 * indistinguishable from a record nobody gave one. That trap caught 36 of
 * TailGrids' 245.
 *
 * Reicon needs it more than any pack before it, because its *Outline* weight is
 * not one thing. Some icons are stroked paths — `Activity` is, at
 * `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, 1.5, round caps
 * and joins, which is `base` exactly. Others are **filled outlines**: the same
 * shape expressed as a filled path with even-odd holes and no stroke at all.
 * Sampled across 40 icons: **18 stroked, 22 filled — a 45% stroked share.**
 *
 * A filled outline renders perfectly well, which is what makes it dangerous
 * rather than obvious. It reads thinner and busier beside a drawn icon and there
 * is no stroke-width to raise, which is precisely why Freepik's 960 hardware
 * icons were refused: legible at 34px, mush at the 20px a list row uses. So the
 * check below is on the raw template and it is not negotiable.
 *
 * It is also why the first curated list was wrong. Reicon's *topical* categories
 * are where the filled ones concentrate — of the icons filed under Devices, IT,
 * Security, Building and Home, **eleven in total are stroked**. The stroked ones
 * are nearly all under `General`, which is why the five below come from there.
 */

import { readFileSync } from "node:fs";

const VERSION = "1.2.4";
const CDN = `https://cdn.jsdelivr.net/npm/reicon@${VERSION}/icons`;

/*
 * Reicon's own kebab -> PascalCase map, from `public/llms-icons.txt` in its
 * repository, vendored beside this script.
 *
 * Guessing the component name from the kebab one was the first cut and it is
 * wrong often enough to matter: `terminal-square` is `TerminalSquare`, but
 * `code2` is `Code2Newicons` and `scale2` is not what you would write either.
 * A guess produces a 404, which this script reports — but a *wrong guess that
 * resolves* would silently vendor a different drawing under the name somebody
 * chose, which nothing would catch.
 */
const INDEX = new Map(
  readFileSync(new URL("./_reicon-index.txt", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => /^- ([a-z0-9-]+) -> (\w+)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

/**
 * Reicon kebab name -> the key an editor picks.
 *
 * Five, and each one is a subject `iconMap` could not express before. The
 * Pascal name is read from Reicon's own index rather than guessed, so a
 * mistyped kebab name is a reported 404 and never a different drawing vendored
 * silently under the name somebody chose.
 *
 * `bluetooth3` rather than `bluetooth`, and that is the mixed-weight rule
 * biting in the open: Reicon's `bluetooth` is a filled outline, `bluetooth2`
 * adds two dots the bare rune does not need, and `bluetooth3` is the rune on
 * its own. Every alternative here was checked the same way.
 */
const WANTED = [
  // A memory module. `cpu`, `disk` and `storage` were all registered and this
  // was not, which for a business that sells and fits hardware is the odd one.
  ["ram", "ram", "Ram"],

  // Asterisks and a caret — a password field. `lock`, `key`, `fingerprint` and
  // `access-card` are all *physical* access; this is the credential one.
  ["password2", "password", "Password2"],

  // `wifi`, `signal`, `antenna` and `sim` were here and the fourth radio was
  // not. It is what a meeting room, a speaker and a scanner are paired with.
  ["bluetooth3", "bluetooth", "Bluetooth3"],

  // A columned courthouse. `compliance` is already the scales — a regulation to
  // satisfy — where this is a sector the way `bank`, `hotel` and `restaurant`
  // are. `judge` draws a gavel, which beside the scales is the same picture
  // twice.
  ["courthouse", "legal", "Courthouse"],
];

/**
 * The outline template out of one icon module.
 *
 * The module holds `O:` (outline) and `F:` (filled) as backtick strings. Only
 * `O` is taken; see the note above for why `F` is unusable here.
 */
function outline(source, pascal) {
  const at = source.indexOf("O: `");

  if (at === -1) return null;

  const start = at + 4;
  const end = source.indexOf("`", start);

  if (end === -1) return null;

  const markup = source.slice(start, end).trim();

  /*
   * Reicon writes the colour and the geometry on every path. `base` already
   * supplies all four as SVG presentation attributes on the parent, and React
   * would need them camel-cased anyway — so they come off rather than being
   * translated. What is left is pure geometry, which is what the other four
   * packs contribute too.
   *
   * **Every `stroke-*` attribute, not the four that were expected.** The first
   * cut named `stroke`, `stroke-width`, `stroke-linecap` and `stroke-linejoin`
   * one at a time — and `Bluetooth3` and `Courthouse` both carry
   * `stroke-miterlimit`, which sailed through into the output as a kebab-cased
   * DOM attribute. React logs *"Invalid DOM property"* as a `console.error` for
   * one of those, and `npm run audit` fails on any console error on any route,
   * so it would have broken every console screen showing a record that used
   * one. Miterlimit is moot here anyway: `base` joins are round.
   */
  const cleaned = markup
    .replace(/\s*stroke(-[a-z]+)?="[^"]*"/g, "")
    .replace(/\s*fill="none"/g, "");

  /*
   * Only genuinely **stroked** icons are taken, and this is the check that
   * matters most in the file.
   *
   * Reicon's Outline weight is not uniform. Some icons are stroked paths —
   * `Activity` is — and those are `base` exactly. Others are *filled
   * outlines*: the outline shape expressed as a filled path with even-odd
   * holes, `fill="currentColor"` and no stroke at all. `Microchip` and `Usb`
   * are both like that.
   *
   * A filled outline renders perfectly well, which is what makes it dangerous
   * rather than obvious: it simply does not carry this set's 1.7 stroke,
   * because there is no stroke to carry it. It reads thinner and busier beside
   * a drawn icon, and there is no stroke-width to raise. That is the exact
   * reason Freepik's 960 hardware icons were refused — legible at 34px, mush
   * at the 20px a list row uses.
   *
   * So the test is made on the **raw** template, before the stroke attributes
   * are stripped: no `stroke=` anywhere means the filled kind.
   */
  if (! /stroke="/.test(markup)) {
    throw new Error(`${pascal}: filled outline, no stroke to carry this set's weight`);
  }

  /*
   * Nothing kebab-cased may reach the output, and this is a guard rather than a
   * longer list of `replace` calls because the list is the thing that was
   * wrong. `stroke-miterlimit` is what got through; `fill-rule` and `clip-rule`
   * are what would get through next, and both ride on exactly the filled paths
   * the check above already refuses — so the day that check is relaxed for one
   * icon, this is what stops the relaxation being silent.
   *
   * It throws rather than translating, deliberately. A translation is a guess
   * about markup nobody has looked at; a refusal is a name printed on the
   * console beside the reason, which is a minute's work and cannot be wrong.
   */
  const kebab = cleaned.match(/\s([a-z]+-[a-z-]+)=/);

  if (kebab) {
    throw new Error(`${pascal}: "${kebab[1]}" is not a React DOM property — camel-case it or strip it`);
  }

  return cleaned;
}

const parts = [];
const failures = [];

for (const [kebab, key] of WANTED) {
  const pascal = INDEX.get(kebab);

  if (!pascal) {
    failures.push(`${key}: "${kebab}" is not in Reicon's index`);
    continue;
  }

  const url = `${CDN}/${pascal}.js`;
  const res = await fetch(url);

  if (!res.ok) {
    failures.push(`${key}: ${pascal}.js → HTTP ${res.status}`);
    continue;
  }

  try {
    const markup = outline(await res.text(), pascal);

    if (!markup) {
      failures.push(`${key}: no outline template in ${pascal}.js`);
      continue;
    }

    parts.push({ key, pascal, markup, kebab });
  } catch (e) {
    failures.push(`${key}: ${e.message}`);
  }
}

if (failures.length) {
  console.error("Not taken:\n  " + failures.join("\n  "));
}

const header = `/*
 * Reicon icons, vendored.
 *
 * Generated by \`scripts/build-reicon.mjs\` from reicon@${VERSION} — MIT,
 * © REICON. Do not edit by hand; re-run the generator.
 *
 * Outline weight only. Reicon's filled weight is \`fill="currentColor"\` with no
 * stroke, and \`base\` sets \`fill: none\`, so a filled icon renders as nothing at
 * all — indistinguishable from a record nobody gave an icon.
 *
 * The stroke, width, caps and joins are stripped by the generator: \`base\`
 * supplies all four on the parent \`<svg>\`, at this set's 1.7 rather than
 * Reicon's 1.5, so a borrowed glyph carries the same weight as a drawn one.
 * Mixed stroke weights in one grid read as sloppy before anybody can say why.
 *
 * ${parts.length} icons, chosen as subjects this business would point a record at
 * rather than as a pack. See the generator's own note for what was left behind.
 */
import { base, type P } from "./icon-base";
`;

const body = parts
  .map(({ key, pascal, markup, kebab }) =>
    `\n/** \`${key}\` — reicon \`${kebab}\`. */\nexport const IconRe${pascal} = (p: P) => (\n  <svg {...base} {...p}>${markup}</svg>\n);`,
  )
  .join("\n");

const map = `\n\n/** The keys this file contributes, for \`iconMap\`. */\nexport const reiconMap = {\n`
  + parts.map(({ key, pascal }) => `  "${key}": IconRe${pascal},`).join("\n")
  + "\n} as const;\n";

process.stdout.write(header + body + map);
