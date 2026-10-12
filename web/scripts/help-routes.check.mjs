// Every id help-routes names exists in help.json, and every console prefix
// finds sections (docs/help-and-tours.md).
// Run from web/: node --experimental-strip-types scripts/help-routes.check.mjs
import { readFileSync } from "node:fs";

const { HELP_ROUTES, CHAPTER_FOR_PREFIX, helpIdsFor } = await import("../src/lib/help-routes.ts");
const { sections } = JSON.parse(readFileSync(new URL("../src/content/help.json", import.meta.url), "utf8"));
const ids = new Set(sections.map((s) => s.id));
const chapters = new Set(sections.map((s) => s.chapter));
let failed = 0;

for (const r of HELP_ROUTES) {
  for (const id of r.sections) {
    if (!ids.has(id)) { failed++; console.error(`FAIL ${r.prefix} names ${id}, which help.json does not have`); }
  }
}
for (const r of CHAPTER_FOR_PREFIX) {
  if (!chapters.has(r.chapter)) { failed++; console.error(`FAIL ${r.prefix} falls back to ${r.chapter}, which is no chapter`); }
}
for (const p of ["/admin", "/admin/tickets", "/admin/tickets/TW-2026-00001", "/admin/store/orders", "/admin/blog/3", "/admin/backups", "/admin/some-new-screen"]) {
  const got = helpIdsFor(p, sections);
  if (!got.length) { failed++; console.error(`FAIL ${p} finds no help`); } else console.log(`ok   ${p} → ${got.join(", ")}`);
}
const t = helpIdsFor("/admin/tickets/TW-2026-00001", sections);
if (t[0] !== "08-tickets#working-a-ticket") { failed++; console.error(`FAIL a ticket's page should open on working-a-ticket, got ${t[0]}`); }

process.exit(failed ? 1 : 0);
