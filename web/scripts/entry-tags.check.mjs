// node --experimental-strip-types scripts/entry-tags.check.mjs
// Pins which caches an entry save purges (0.186.0, docs/content-presets.md):
// the type's own tags always, and the settings map — which every public page
// reads — only for a testimonial, the one kind that can be the homepage quote.
import { entryTags } from "../src/lib/entry-tags.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const plain = entryTags("case-notes", ["one", "one", null, ""], null);
ok(plain.includes("entries:case-notes") && plain.includes("content-types") && plain.includes("menu"), "an entry purges its type's list, the types and the menu");
ok(plain.filter((t) => t === "entry:case-notes:one").length === 1, "each slug once, blanks skipped");
ok(!plain.includes("settings"), "an ordinary entry leaves the settings map alone");
ok(!entryTags("awards", ["a"], "awards").includes("settings"), "an award leaves it alone too");
ok(entryTags("kind-words", ["a"], "testimonials").includes("settings"), "a testimonial purges the settings map, whatever the type is called");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
