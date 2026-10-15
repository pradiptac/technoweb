// The heading effect resolver (docs/motion.md "Kinetic headings").
// Run from web/: node --experimental-strip-types scripts/kinetic.check.mjs
const { kineticFor, kineticWords, splitLast, findMark } = await import("../src/lib/kinetic.ts");
let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { failed++; console.error(`FAIL ${name}: got ${a}, want ${b}`); } else console.log(`ok   ${name}`);
};
eq("default follows the site", kineticFor("type", "default", ""), { effect: "type", words: [] });
eq("blank follows the site", kineticFor("decode", undefined, null), { effect: "decode", words: [] });
eq("an override wins", kineticFor("type", "highlight", "fast"), { effect: "highlight", words: ["fast"] });
eq("an unknown id is none", kineticFor("spin", "default", ""), { effect: "none", words: [] });
eq("rotate without words is none", kineticFor("none", "rotate", " \n "), { effect: "none", words: [] });
eq("rotate with words", kineticFor("none", "rotate", "servers\n\n storage "), { effect: "rotate", words: ["servers", "storage"] });
eq("site rotate is refused (needs words)", kineticFor("rotate", "default", ""), { effect: "none", words: [] });
eq("words: at most six, trimmed", kineticWords("a\nb\nc\nd\ne\nf\ng"), ["a", "b", "c", "d", "e", "f"]);
eq("words: CRLF lines", kineticWords("a\r\nb"), ["a", "b"]);
eq("splitLast", splitLast("Keep the  network up "), { head: "Keep the  network", last: "up" });
eq("splitLast one word", splitLast("Uptime"), { head: "", last: "Uptime" });
eq("findMark word", findMark("We keep networks running", "NETWORKS"), { before: "We keep ", mark: "networks", after: " running" });
eq("findMark falls back to the last word", findMark("We keep networks running", "absent"), { before: "We keep networks ", mark: "running", after: "" });
eq("findMark one word", findMark("Uptime", undefined), { before: "", mark: "Uptime", after: "" });
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
