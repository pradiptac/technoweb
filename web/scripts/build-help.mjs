/**
 * Builds web/src/content/help.json from manual/*.md (docs/help-and-tours.md).
 *
 *   node scripts/build-help.mjs           write it        (npm run help)
 *   node scripts/build-help.mjs --check   exit 1 when the committed file is stale
 *
 * release/build.mjs runs --check, so a manual edited without regenerating the
 * help cannot ship. The file is committed: the website reads it at run time
 * and the release staging copy has no manual/ beside it.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSections } from "./help-convert.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manual = join(here, "..", "..", "manual");
const target = join(here, "..", "src", "content", "help.json");

const files = readdirSync(manual).filter((f) => /^\d{2}-.*\.md$/.test(f) && !f.startsWith("00-")).sort();
const sections = files.flatMap((f) => splitSections(readFileSync(join(manual, f), "utf8"), f.replace(/\.md$/, "")));
const json = JSON.stringify({ sections }, null, 1) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== json) {
    console.error("web/src/content/help.json is out of date with manual/. Run: npm run help (from web/)");
    process.exit(1);
  }
  console.log(`help.json is current (${sections.length} sections).`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
  console.log(`Wrote ${sections.length} sections from ${files.length} chapters.`);
}
