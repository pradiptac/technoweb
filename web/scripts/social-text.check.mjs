// node --experimental-strip-types scripts/social-text.check.mjs
// Pins the X length rule; must match App\Support\Social\SocialText (C7).
import { xFits, xLength, xTotal } from "../src/lib/social-text.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

ok(xLength("") === 0, "nothing is zero");
ok(xLength("hello") === 5, "plain text counts its characters");
ok(xLength("see https://technoware.in/a/very/long/path?x=1 now") === 4 + 23 + 4, "a link counts 23 whatever its length");
ok(xLength("a http://x.in b https://y.in c") === 2 + 23 + 3 + 23 + 2, "each link counts");
ok(xLength("naïve — café") === Array.from("naïve — café").length, "characters, not bytes");
ok(xLength("😀") === 1, "an astral character is one, as mb_strlen counts it");
ok(xTotal("hello") === 5 + 1 + 23, "the appended link and its space are added");
ok(xFits("a".repeat(256)), "256 + 1 + 23 = 280 fits");
ok(!xFits("a".repeat(257)), "257 does not");
ok(xFits("a".repeat(280), ""), "with no link nothing is appended");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
