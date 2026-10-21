// node --experimental-strip-types scripts/mentions.check.mjs
// Pins the @-mention text helpers (C2, docs/notifications.md).
import { findMentionQuery, insertMention, keepMentioned, mentionSegments, mentionIdsFrom } from "../src/lib/mentions.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

ok(findMentionQuery("Hi @as", 6)?.query === "as", "an @ at a word start opens the query");
ok(findMentionQuery("mail me@example", 15) === null, "an @ inside a word is an address, not a mention");
ok(findMentionQuery("@", 1)?.query === "", "a bare @ opens an empty query");
ok(findMentionQuery("Hi @as fine", 11) === null, "a space after the query closes it");
ok(findMentionQuery("(@ra", 4)?.start === 1, "an @ after a bracket opens the query");
const ins = insertMention("Hi @as", 3, 6, "Asha Rao");
ok(ins.text === "Hi @Asha Rao " && ins.caret === 13, "choosing inserts the full name and a space");
const mid = insertMention("Hi @as, there", 3, 6, "Asha");
ok(mid.text === "Hi @Asha , there" && mid.caret === 9, "text after the caret is kept");
const segs = mentionSegments("Ask @Asha Rao and @Nobody", ["Asha Rao"]);
ok(segs.length === 3 && segs[1].mention && segs[1].text === "@Asha Rao" && !segs[2].mention, "only a mentioned person's name is highlighted");
ok(mentionSegments("<b>@Asha Rao</b>", ["Asha Rao"]).map((s) => s.text).join("") === "<b>@Asha Rao</b>", "text is kept as typed");
ok(mentionSegments("@Asha and @Asha Rao", ["Asha", "Asha Rao"]).filter((s) => s.mention).map((s) => s.text).join("|") === "@Asha|@Asha Rao", "the longest name wins");
ok(mentionSegments("plain", []).length === 1, "no names is one run");
ok(JSON.stringify(mentionIdsFrom('[3,"4",-1,"x",3]')) === "[3,4]", "ids are positive integers, once");
ok(JSON.stringify(mentionIdsFrom("not json")) === "[]", "a broken value is no ids");
ok(JSON.stringify(mentionIdsFrom('{"a":1}')) === "[]", "an object is no ids");
ok(JSON.stringify(mentionIdsFrom(["7", "7", "0", "abc", "9"])) === "[7,9]", "the form's mentions[] values are read the same way");
ok(JSON.stringify(mentionIdsFrom([{}, [], null])) === "[]", "a value that is not a number or a string is dropped");

const asha = { id: 1, name: "Asha Rao" };
const ravi = { id: 2, name: "Ravi Menon" };
ok(keepMentioned([asha, ravi], "Over to @asha rao, thanks").map((p) => p.id).join() === "1", "after a refused submit, people still named in the text are kept");
ok(keepMentioned([asha, ravi], "").length === 0, "after a successful submit the box is empty and nobody is kept");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
