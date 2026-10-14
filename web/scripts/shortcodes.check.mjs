// node --experimental-strip-types scripts/shortcodes.check.mjs
// Pins the inline icon shortcode (0.179.0): expanded inside a paragraph, and
// nothing but a well-formed Google icon name can come out of it.
import { expandInlineIcons } from "../src/lib/shortcodes.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const out = expandInlineIcons('<p>Call us [icon name="ms:call"] today</p>');
ok(out.includes('<use href="/icons/material/call.svg#i"/>') && out.startsWith("<p>Call us <svg"), "an icon becomes an inline svg in place");
ok(out.endsWith(" today</p>"), "the words around it are untouched");

const hostile = '<p>[icon name="ms:call\\" onload=\\"x"]</p>';
ok(expandInlineIcons(hostile) === hostile, "markup in the name stays literal");
const angle = '<p>[icon name="ms:<img src=x>"]</p>';
ok(expandInlineIcons(angle) === angle, "an angle bracket in the name stays literal");

const site = '<p>[icon name="router"]</p>';
ok(expandInlineIcons(site) === site, "a site icon name is left as typed");
ok(expandInlineIcons("<p>[icon name=&quot;ms:call&quot;]</p>").includes("<svg"), "the editor's entity-encoded quotes still match");
ok((expandInlineIcons('<p>[icon name="ms:a"][icon name="ms:b"]</p>').match(/<svg/g) ?? []).length === 2, "two in one paragraph both expand");
ok(expandInlineIcons("<p>No icons</p>") === "<p>No icons</p>", "a body without one is untouched");
ok(expandInlineIcons('<p>[icon name="ms:' + "a".repeat(38) + '"]</p>').includes("<svg") === false, "a name over 37 characters is left as typed");

process.exit(failed ? 1 : 0);
