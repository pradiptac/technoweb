# Simple to use (0.168.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the console self-explaining. A "?" help drawer shows each screen's manual sections; first-visit tours run on six key screens; a Simple view switch hides the advanced form tabs; and every empty list says what to do next.

**Architecture:**
- **Help:** the manual's Markdown is converted at build time, by a dependency-free script, into a committed `help.json`. A staff-only route handler serves sections by route, by search or by id. A side-sheet variant of the existing `<dialog>` modal shows them.
- **Tours:** steps keyed by screen, pointing at `data-tour` attributes, run by one client island.
- **Simple view:** a per-browser preference, stamped before paint like density. `buildFormTabs` marks a tab as advanced and `Tabs` hides it.
- **Empty states:** one small action component reused by every index page.

**Tech Stack:** Next.js 16, React 19.3, TypeScript 5.9, Tailwind v4, Playwright probes, Node 24 (`--experimental-strip-types` for self-checks). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-12-simple-to-use-design.md`

## Global Constraints

- **Dependencies and bundle:** no new npm dependency. The manual never enters a client bundle; it is served by a route handler.
- **Client imports:** client components import glyphs from `@/components/icons-ui` only.
- **Colours:** tokens only, no hex.
- **Tailwind v4 traps:** use the `hidden` class, never the attribute, where something must reappear. Transition `translate`, never `transform`.
- **Preferences:** in `localStorage`, stamped before paint by the root layout's script (the `tw_console_density` pattern). Keys: `tw_console_simple` and `tw_tour:<id>`.
- **Motion:** the tours move between steps without animation (keyboard-driven); only the card's first appearance fades, and only inside `prefers-reduced-motion: no-preference`.
- **Headings and layout:** one `h1` per page. No horizontal overflow at 320–414 and 1280.
- **File edits:** `web/` files are CRLF; edit with the Edit tool or a bytes-preserving script, never Python `write_text`. Bash heredocs eat backslashes, so write scripts with the Write tool.
- **Probes:** each opens with a docblock and signs in through env credentials (`ADMIN_LOGIN_*`, `PORTAL_LOGIN_*`). Create throwaway accounts with the scratchpad's `mkstaff.php` / `mkcust.php`, delete them at the end, and never run two probes as the same account at once.
- **Release discipline:**
  - VERSION.md plus `APP_VERSION`
  - `docs/help-and-tours.md` plus CLAUDE.md module lines
  - tsc, lint
  - `npm run audit` light and dark (admin and portal), `npm run audit:mobile`
  - the probes
  - judging by eye at 390 and 1280

## Review Focus

1. **A manual heading renamed after release:** the drawer must not go empty. Pinned by the routes self-check in Task 2 and the `--check` gate in Task 8.
2. **Markdown that would inject markup** (`<script>`, `javascript:` links, raw HTML in the manual) must come out inert. Pinned by the converter fixture in Task 1.
3. **A validation error on a tab hidden by Simple view** must still be visible and jumped to. Pinned in Task 6's probe.
4. **A tour step whose element is missing** (another role, an empty list) must be skipped, not stall on an empty frame. Pinned in Task 5's probe.
5. **The `?` shortcut while typing in a field** must type a question mark, not open the drawer. Pinned in Task 4's probe.

---

### Task 1: The help converter and `help.json`

**Files:**
- Create: `web/scripts/build-help.mjs`
- Create: `web/scripts/help-convert.mjs` (the pure converter, so the self-check can import it)
- Create: `web/scripts/help-convert.check.mjs`
- Create: `web/src/content/help.json` (generated)
- Modify: `web/package.json` (scripts `"help": "node scripts/build-help.mjs"`)

**Interfaces:**
- Produces:
  - `markdownToHtml(md: string): string` and `splitSections(md: string, stem: string): Section[]` from `help-convert.mjs`
  - `Section = { id: string; chapter: string; chapterTitle: string; title: string; html: string; text: string }`
  - `help.json`, which is `{ sections: Section[] }` in manual order

- [ ] **Step 1: Write the fixture self-check** `web/scripts/help-convert.check.mjs`:

```js
// Self-check for scripts/help-convert.mjs. Run: node scripts/help-convert.check.mjs
import { markdownToHtml, splitSections } from "./help-convert.mjs";
let failed = 0;
const eq = (got, want, label) => { if (got !== want) { failed++; console.error(`FAIL ${label}\n  got:  ${got}\n  want: ${want}`); } else console.log(`ok   ${label}`); };
const has = (got, frag, label) => { if (!got.includes(frag)) { failed++; console.error(`FAIL ${label}\n  in: ${got}\n  missing: ${frag}`); } else console.log(`ok   ${label}`); };
const lacks = (got, frag, label) => { if (got.includes(frag)) { failed++; console.error(`FAIL ${label}\n  in: ${got}\n  has: ${frag}`); } else console.log(`ok   ${label}`); };

eq(markdownToHtml("Plain **bold** and *it* and `code`."), "<p>Plain <strong>bold</strong> and <em>it</em> and <code>code</code>.</p>", "inline marks");
eq(markdownToHtml("- one\n- two"), "<ul><li>one</li><li>two</li></ul>", "bullet list");
eq(markdownToHtml("1. one\n2. two"), "<ol><li>one</li><li>two</li></ol>", "numbered list");
eq(markdownToHtml("### Sub"), "<h3>Sub</h3>", "h3");
has(markdownToHtml("| A | B |\n|---|---|\n| 1 | **2** |"), "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>", "table");
has(markdownToHtml("```\n<b>x</b>\n```"), "<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>", "code block escaped");
eq(markdownToHtml("> Note"), "<blockquote><p>Note</p></blockquote>", "quote");
has(markdownToHtml("[site](https://example.com)"), '<a href="https://example.com" target="_blank" rel="noopener">site</a>', "external link");
has(markdownToHtml("[roles](17-users-and-roles.md#staff-accounts)"), '<a href="#help:17-users-and-roles#staff-accounts" data-help-link="17-users-and-roles#staff-accounts">roles</a>', "manual link stays in the drawer");
has(markdownToHtml("[queue](/admin/tickets)"), '<a href="/admin/tickets">queue</a>', "site path link");
lacks(markdownToHtml("<script>alert(1)</script>"), "<script>", "raw html escaped");
lacks(markdownToHtml("[x](javascript:alert(1))"), "javascript:", "javascript link dropped");
lacks(markdownToHtml('[x](https://a.test" onmouseover="y)'), "onmouseover=\"", "quote in url cannot break out");

const secs = splitSections("# The support desk\n\nIntro.\n\n## The ticket queue\n\nText **here**.\n\n### Statuses\n\nMore.\n\n## Saved replies\n\nLast.", "08-tickets");
eq(secs.map((s) => s.id).join(","), "08-tickets#overview,08-tickets#the-ticket-queue,08-tickets#saved-replies", "section ids");
eq(secs[1].chapterTitle, "The support desk", "chapter title");
has(secs[1].html, "<h3>Statuses</h3>", "sub-headings stay inside their section");
eq(secs[1].text.includes("**"), false, "text has no markup");

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it; it fails** because the module doesn't exist yet.

Run, from `web/`: `node scripts/help-convert.check.mjs`
Expected: `ERR_MODULE_NOT_FOUND`, exit 1.

- [ ] **Step 3: Write `web/scripts/help-convert.mjs`.**

```js
/**
 * The manual's Markdown to the help drawer's HTML (docs/help-and-tours.md).
 * Exactly the constructs manual/*.md uses — headings below ##, paragraphs,
 * one level of nested lists, GitHub tables, **bold**, *italic*, `code`,
 * fenced code, [links](…) and > quotes. Everything is escaped before any
 * markup is added, so raw HTML in the manual arrives as text; a link is
 * kept only when it is https://, a site path, an anchor, or another
 * chapter of the manual (which the drawer opens in place).
 */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const slug = (s) => s.toLowerCase().replace(/[`*_]/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function link(text, url) {
  const u = url.trim();
  const manual = u.match(/^(\d{2}-[a-z0-9-]+)\.md(?:#([a-z0-9-]+))?$/);
  if (manual) {
    const id = `${manual[1]}#${manual[2] ?? "overview"}`;
    return `<a href="#help:${id}" data-help-link="${id}">${text}</a>`;
  }
  if (/^https:\/\/[^\s"<>]+$/.test(u)) return `<a href="${u}" target="_blank" rel="noopener">${text}</a>`;
  if (/^(\/[^\s"<>]*|#[a-z0-9-]+)$/.test(u)) return `<a href="${u}">${text}</a>`;
  return text;
}

function inline(raw) {
  const codes = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => link(t, u.replace(/&quot;/g, '"').replace(/&amp;/g, "&")));
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{3,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{3,}/)) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i];
        const nested = /^\s{2,}([-*]|\d+\.)\s+/.test(l);
        const text = l.replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (nested && items.length) items[items.length - 1].sub.push(text);
        else if (/^\s{2,}\S/.test(l) && !/^\s*([-*]|\d+\.)\s+/.test(l)) items[items.length - 1].text += ` ${l.trim()}`;
        else items.push({ text, sub: [] });
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (line.startsWith(">")) {
      const body = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${inline(body.join(" "))}</p></blockquote>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s+|\|)/.test(lines[i])) para.push(lines[i++].trim());
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    else i++;
  }
  return out.join("");
}

const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** A chapter into its `##` sections; what sits under the `#` title is "overview". */
export function splitSections(md, stem) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.find((l) => /^#\s/.test(l)) ?? `# ${stem}`;
  const chapterTitle = titleLine.replace(/^#\s+/, "").trim();
  const parts = [];
  let current = { title: "Overview", key: "overview", body: [] };
  for (const l of lines) {
    if (/^#\s/.test(l)) continue;
    const m = l.match(/^##\s+(.*)$/);
    if (m) { parts.push(current); current = { title: m[1].trim(), key: slug(m[1]), body: [] }; continue; }
    current.body.push(l);
  }
  parts.push(current);
  return parts
    .filter((p) => p.body.join("").trim())
    .map((p) => {
      const html = markdownToHtml(p.body.join("\n"));
      return { id: `${stem}#${p.key}`, chapter: stem, chapterTitle, title: p.title.replace(/[`*]/g, ""), html, text: plain(html) };
    });
}
```

- [ ] **Step 4: Run the self-check; it passes.** Run `node scripts/help-convert.check.mjs`. Expected: every line `ok`, exit 0. If a case fails, fix the converter, not the fixture, unless the fixture misstates the spec.

- [ ] **Step 5: Write `web/scripts/build-help.mjs`.**

```js
/**
 * Builds web/src/content/help.json from manual/*.md (docs/help-and-tours.md).
 *   node scripts/build-help.mjs           write it
 *   node scripts/build-help.mjs --check   exit 1 when the committed file is stale
 * release/build.mjs runs --check, so a stale help file cannot ship.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
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
    console.error("help.json is out of date with manual/. Run: npm run help (from web/)");
    process.exit(1);
  }
  console.log(`help.json is current (${sections.length} sections).`);
} else {
  writeFileSync(target, json);
  console.log(`Wrote ${sections.length} sections from ${files.length} chapters.`);
}
```

- [ ] **Step 6: Generate and check.** Run: `node scripts/build-help.mjs && node scripts/build-help.mjs --check`.
Expected: "Wrote N sections…", then "help.json is current".

Then look at two sections by eye: `node -e "const h=require('./src/content/help.json');console.log(h.sections.find(s=>s.id==='08-tickets#the-ticket-queue').html.slice(0,600))"`.

- [ ] **Step 7: Add the npm script** `"help": "node scripts/build-help.mjs"` to `web/package.json` after `"neon"`.

- [ ] **Step 8: Commit**

```bash
git add web/scripts/help-convert.mjs web/scripts/help-convert.check.mjs web/scripts/build-help.mjs web/src/content/help.json web/package.json
git commit -m "help: the manual converted to help.json, with a fixture self-check"
```

---

### Task 2: Mapping screens to sections

**Files:**
- Create: `web/src/lib/help-routes.ts`
- Create: `web/scripts/help-routes.check.mjs`

**Interfaces:**
- Consumes: the `help.json` ids from Task 1.
- Produces:
  - `HELP_ROUTES: { prefix: string; sections: string[] }[]`
  - `CHAPTER_FOR_PREFIX: { prefix: string; chapter: string }[]`
  - `helpIdsFor(path: string, all: { id: string; chapter: string }[]): string[]`

- [ ] **Step 1: Write the self-check** `web/scripts/help-routes.check.mjs`:

```js
// Every id the routes name exists, and every console prefix finds sections.
// Run: node --experimental-strip-types scripts/help-routes.check.mjs
import { readFileSync } from "node:fs";
const { HELP_ROUTES, helpIdsFor } = await import("../src/lib/help-routes.ts");
const { sections } = JSON.parse(readFileSync(new URL("../src/content/help.json", import.meta.url), "utf8"));
const ids = new Set(sections.map((s) => s.id));
let failed = 0;
for (const r of HELP_ROUTES) for (const id of r.sections) if (!ids.has(id)) { failed++; console.error(`FAIL ${r.prefix} names ${id}, which help.json does not have`); }
for (const p of ["/admin", "/admin/tickets", "/admin/store/orders", "/admin/blog/3", "/admin/backups", "/admin/some-new-screen"]) {
  const got = helpIdsFor(p, sections);
  if (!got.length) { failed++; console.error(`FAIL ${p} finds no help`); } else console.log(`ok   ${p} → ${got[0]}`);
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it; it fails** because `help-routes.ts` is missing.

- [ ] **Step 3: Write `web/src/lib/help-routes.ts`.**
  - Read `help.json`'s ids (`node -e "require('./src/content/help.json').sections.forEach(s=>console.log(s.id))"`), then fill `HELP_ROUTES` for the console's main screens:
    - the dashboard
    - tickets, customers, leads, visits, meetings
    - content (blog, knowledge base, pages, builder, library, detail templates)
    - catalogue, store (orders, products, shipping, returns, coupons), media
    - newsletter, messaging, SEO, assistant
    - site (themes, menus, settings), staff, system (backups, updates, status, imports)
    - events, careers, downloads
  - Each entry lists the 1–3 most relevant section ids, using real ids only.
  - `CHAPTER_FOR_PREFIX` covers the sidebar sections as the fallback.

```ts
/**
 * Which manual sections the help drawer shows for a console screen
 * (docs/help-and-tours.md). The longest matching prefix wins — the sidebar's
 * rule — and a screen nobody listed falls back to its area's chapter, so
 * every screen shows something. scripts/help-routes.check.mjs fails when an
 * id here is not in help.json, so a renamed manual heading is caught, not
 * shipped as an empty drawer. No directive: the route handler imports it.
 */
export const HELP_ROUTES: { prefix: string; sections: string[] }[] = [
  { prefix: "/admin", sections: ["08-tickets#the-dashboard", "04-first-steps#overview"] },
  { prefix: "/admin/tickets", sections: ["08-tickets#the-ticket-queue", "08-tickets#working-a-ticket", "08-tickets#saved-replies"] },
  // … one row per screen, ids taken from help.json
];

export const CHAPTER_FOR_PREFIX: { prefix: string; chapter: string }[] = [
  { prefix: "/admin/tickets", chapter: "08-tickets" },
  { prefix: "/admin/customers", chapter: "09-customers" },
  { prefix: "/admin/leads", chapter: "10-leads-and-visits" },
  { prefix: "/admin/store", chapter: "07-store" },
  // … one row per sidebar area
  { prefix: "/admin", chapter: "04-first-steps" },
];

const longest = <T extends { prefix: string }>(rows: T[], path: string) =>
  rows.filter((r) => path === r.prefix || path.startsWith(`${r.prefix}/`)).sort((a, b) => b.prefix.length - a.prefix.length)[0];

export function helpIdsFor(path: string, all: { id: string; chapter: string }[]): string[] {
  const exact = longest(HELP_ROUTES, path);
  if (exact && exact.prefix !== "/admin") return exact.sections;
  if (path === "/admin" && exact) return exact.sections;
  const area = longest(CHAPTER_FOR_PREFIX, path);
  return area ? all.filter((s) => s.chapter === area.chapter).slice(0, 3).map((s) => s.id) : [];
}
```

  The first `HELP_ROUTES` row's ids are placeholders for the shape; replace every id with ones printed from `help.json`. The self-check enforces this.

- [ ] **Step 4: Run the self-check; it passes.** Run `node --experimental-strip-types scripts/help-routes.check.mjs`. Expected: all `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/help-routes.ts web/scripts/help-routes.check.mjs
git commit -m "help: which manual sections each console screen shows"
```

---

### Task 3: The help route handler, behind the probe

**Files:**
- Create: `web/scripts/probes/help-drawer.mjs` (written first)
- Create: `web/src/app/api/admin/help/route.ts`

**Interfaces:**
- Consumes:
  - `helpIdsFor` from Task 2
  - `help.json`
  - `getCurrentStaff()` from `@/lib/admin-auth`
- Produces: `GET /api/admin/help`, answering one of:
  - `{ sections: Section[]; tour: string | null; chapter: { id, title } | null }` for `?path=`
  - `{ results: { id, title, chapterTitle, excerpt }[] }` for `?q=`
  - `{ section: Section | null }` for `?section=`
  - 401 without a staff session

- [ ] **Step 1: Write the probe** `web/scripts/probes/help-drawer.mjs`. It covers the route checks now and the drawer checks for Task 4:

```js
import { chromium } from "playwright";

/**
 * Measures the console's help drawer (docs/help-and-tours.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/help-drawer.mjs
 *
 * (1) /api/admin/help answers 401 without a session and sections with one.
 * (2) "?" opens the drawer; focus moves into it; /admin/tickets shows "The
 * ticket queue". (3) Search finds a section. (4) A link to another manual
 * section opens in place; Back returns. (5) Escape closes it and focus
 * returns to the button. (6) The "?" key opens it; typed into a field it
 * does not. (7) Nothing logged.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const anon = await browser.newContext();
const r401 = await anon.request.get(`${BASE}/api/admin/help?path=/admin/tickets`);
ok(r401.status() === 401, `help route refuses a visitor without a session (${r401.status()})`);
await anon.close();

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);

const api = await page.request.get(`${BASE}/api/admin/help?path=/admin/tickets`);
const body = api.ok() ? await api.json() : null;
ok(Boolean(body?.sections?.length), `help route answers sections for /admin/tickets (${body?.sections?.length ?? 0})`);

await page.goto(`${BASE}/admin/tickets`, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(1500);
const button = page.getByRole("button", { name: "Help for this screen" });
ok(await button.count() === 1, "the help button is in the top bar");
if (await button.count() === 1) {
  await button.click();
  const drawer = page.locator("dialog[open][data-help-drawer]");
  await drawer.waitFor({ timeout: 30000 }).catch(() => {});
  ok(await drawer.count() === 1, "the drawer opens");
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-help-drawer]"))), "focus moves into the drawer");
  ok(await drawer.getByRole("heading", { name: /The ticket queue/i }).count() >= 1, "it shows this screen's section");

  await drawer.getByRole("searchbox").fill("backup");
  await page.waitForTimeout(1200);
  ok(await drawer.locator("[data-help-result]").count() >= 1, "search finds sections");
  await drawer.getByRole("searchbox").fill("");
  await page.waitForTimeout(800);

  const inner = drawer.locator("a[data-help-link]").first();
  if (await inner.count()) {
    await inner.click();
    await page.waitForTimeout(1000);
    ok(await drawer.getByRole("button", { name: "Back" }).count() === 1, "a manual link opens in place with a Back button");
    await drawer.getByRole("button", { name: "Back" }).click();
    await page.waitForTimeout(600);
  } else console.log("note no manual links in this screen's sections");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  ok(await page.locator("dialog[open][data-help-drawer]").count() === 0, "Escape closes it");
  ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Help for this screen"), "focus returns to the help button");
}

await page.locator("body").click({ position: { x: 5, y: 400 } });
await page.keyboard.press("Shift+Slash");
await page.waitForTimeout(800);
ok(await page.locator("dialog[open][data-help-drawer]").count() === 1, "the ? key opens the drawer");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const field = page.locator("main input[type=search], main input[type=text]").first();
if (await field.count()) {
  await field.click();
  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(500);
  ok(await page.locator("dialog[open][data-help-drawer]").count() === 0, "typing ? into a field does not open the drawer");
}

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it; it fails** on the route (404, so the 401 check fails), the button and the drawer.

- [ ] **Step 3: Write `web/src/app/api/admin/help/route.ts`.**

```ts
import { NextResponse, type NextRequest } from "next/server";
import help from "@/content/help.json";
import { helpIdsFor } from "@/lib/help-routes";
import { tourFor } from "@/lib/tours";
import { getCurrentStaff } from "@/lib/admin-auth";

type Section = { id: string; chapter: string; chapterTitle: string; title: string; html: string; text: string };
const SECTIONS = (help as { sections: Section[] }).sections;
const BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

/**
 * The help drawer's content (docs/help-and-tours.md), read on the server so
 * the manual never enters a page's JavaScript. Staff only.
 *   ?path=/admin/tickets   this screen's sections, its tour, its chapter
 *   ?q=words               up to 20 sections holding every word
 *   ?section=08-tickets#…  one section, for a link inside the drawer
 */
export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff().catch(() => null);
  if (!staff) return NextResponse.json({ message: "Unauthenticated." }, { status: 401 });
  const headers = { "Cache-Control": "no-store" };
  const url = request.nextUrl;

  const id = url.searchParams.get("section");
  if (id) return NextResponse.json({ section: BY_ID.get(id) ?? null }, { headers });

  const q = url.searchParams.get("q")?.trim().toLowerCase().slice(0, 100);
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    const hit = (s: Section) => words.every((w) => s.title.toLowerCase().includes(w) || s.text.toLowerCase().includes(w));
    const titleFirst = (s: Section) => (words.every((w) => s.title.toLowerCase().includes(w)) ? 0 : 1);
    const results = SECTIONS.filter(hit).sort((a, b) => titleFirst(a) - titleFirst(b)).slice(0, 20).map((s) => {
      const at = Math.max(0, s.text.toLowerCase().indexOf(words[0]!) - 60);
      return { id: s.id, title: s.title, chapterTitle: s.chapterTitle, excerpt: s.text.slice(at, at + 160) };
    });
    return NextResponse.json({ results }, { headers });
  }

  const path = url.searchParams.get("path") ?? "/admin";
  const sections = helpIdsFor(path, SECTIONS).map((i) => BY_ID.get(i)).filter((s): s is Section => Boolean(s));
  const first = sections[0];
  return NextResponse.json({
    sections,
    tour: tourFor(path),
    chapter: first ? { id: first.chapter, title: first.chapterTitle } : null,
  }, { headers });
}
```

  `tourFor` comes from Task 5. Until then, create `web/src/lib/tours.ts` with `export function tourFor(_path: string): string | null { return null; }` so this compiles; Task 5 replaces it.

- [ ] **Step 4: Run the probe.** Expected: (1) and the route-answers check pass; the drawer checks still fail.

- [ ] **Step 5: Commit**

```bash
git add web/scripts/probes/help-drawer.mjs web/src/app/api/admin/help/route.ts web/src/lib/tours.ts
git commit -m "help: staff-only route serving sections by screen, search or id"
```

---

### Task 4: The side-sheet modal and the help drawer

**Files:**
- Modify: `web/src/components/ui/modal.tsx` (a `side` size)
- Create: `web/src/components/admin/help-drawer.tsx`
- Modify: `web/src/app/admin/(app)/layout.tsx` (mount the button in `TopBar`)
- Modify: `web/src/app/globals.css` (the side sheet's placement and slide, inside the motion guard)

**Interfaces:**
- Consumes: `GET /api/admin/help` (Task 3) and `Prose` (`components/ui/prose.tsx`) styles. Check the export name with `grep -n "export function Prose" web/src/components/ui/prose.tsx`.
- Produces:
  - `<HelpDrawer />`, a client component: the button, plus the drawer it opens
  - the drawer listens for `tw:help` (detail `{ section?: string }`) on `window`, so a tour or another screen can open it
  - the drawer dispatches `tw:tour-start` (detail `{ id }`) for "Take the tour"

- [ ] **Step 1: The `side` size in `modal.tsx`.**
  - Add `side: "max-w-[28rem]"` to `WIDTH`, with a comment: "The help drawer: a full-height panel against the right edge (0.168.0)".
  - When `size === "side"`, the dialog's classes become `m-0 ml-auto h-dvh max-h-dvh w-[min(28rem,100vw)] rounded-none border-0 border-l` instead of the centred box (`m-auto w-[calc(100vw-2rem)] rounded-xl … max-h-[min(38rem,…)]`). Apply this with `cn(size === "side" ? SIDE : CENTRED, WIDTH[size])`, where `SIDE` and `CENTRED` are the two class strings.
  - Add `data-side` on the `<dialog>` when side.
  - In `globals.css`, beside the existing `dialog-motion` block, inside `prefers-reduced-motion: no-preference`:

```css
dialog[data-side].dialog-motion[open] { animation: help-in var(--duration-slow) var(--ease-brand) both; }
@keyframes help-in { from { translate: 100% 0; } }
```

- [ ] **Step 2: Write `components/admin/help-drawer.tsx`.**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Section = { id: string; title: string; chapterTitle: string; html: string };
type Result = { id: string; title: string; chapterTitle: string; excerpt: string };

/**
 * The console's "?" (docs/help-and-tours.md): this screen's manual sections
 * in a side sheet, a search over every section, links between sections
 * opened in place, and the screen's tour. The `?` key opens it unless the
 * focus is in a field, where it types a question mark.
 */
export function HelpDrawer() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ sections: Section[]; tour: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [stack, setStack] = useState<Section[]>([]);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/help?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch { setFailed(true); }
  }, [path]);

  const openSection = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/help?section=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json() : null;
    if (json?.section) setStack((s) => [...s, json.section]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      e.preventDefault();
      setOpen(true);
    };
    const onOpen = (e: Event) => { setOpen(true); const id = (e as CustomEvent<{ section?: string }>).detail?.section; if (id) void openSection(id); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tw:help", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("tw:help", onOpen); };
  }, [openSection]);

  useEffect(() => { if (open) { setStack([]); setQ(""); setResults(null); void load(); } }, [open, load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return; }
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/admin/help?q=${encodeURIComponent(term)}`, { cache: "no-store" }).catch(() => null);
      setResults(res?.ok ? (await res.json()).results : []);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const onLinkClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-help-link]");
    if (!a) return;
    e.preventDefault();
    void openSection(a.dataset.helpLink!);
  };

  const shown = stack.length ? [stack[stack.length - 1]!] : data?.sections ?? [];

  return (
    <>
      <button
        ref={button} type="button" aria-label="Help for this screen" title="Help (?)"
        onClick={() => setOpen(true)}
        className="grid size-8 place-items-center rounded-full border border-line-strong text-13 font-semibold text-muted transition-colors hover:border-faint hover:text-ink"
      >
        ?
      </button>
      <Modal open={open} onClose={() => { setOpen(false); button.current?.focus(); }} title="Help" size="side" dataAttr="help-drawer">
        <div className="grid gap-4">
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the manual"
            aria-label="Search the manual" autoFocus
            className="w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-14 focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none"
          />
          {stack.length > 0 && !results && (
            <button type="button" onClick={() => setStack((s) => s.slice(0, -1))} className="justify-self-start text-13 font-semibold text-brand-ink hover:underline">Back</button>
          )}
          {failed && <p className="text-13 text-err">Help could not be loaded. <button type="button" onClick={() => void load()} className="font-semibold underline">Retry</button></p>}
          {results ? (
            results.length === 0 ? <p className="text-13 text-muted">Nothing in the manual matches “{q.trim()}”.</p> : (
              <ul className="grid gap-2">
                {results.map((r) => (
                  <li key={r.id} data-help-result>
                    <button type="button" onClick={() => { setQ(""); setResults(null); void openSection(r.id); }} className="w-full rounded-lg border border-line-strong bg-card p-3 text-left hover:border-brand-ink/30">
                      <span className="block text-13-5 font-semibold">{r.title}</span>
                      <span className="block text-12 text-muted">{r.chapterTitle}</span>
                      <span className="mt-1 block text-12-5 text-ink-2">{r.excerpt}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : !data && !failed ? (
            <div className="grid gap-2" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>
          ) : (
            <div onClick={onLinkClick} className="grid gap-6">
              {shown.map((s) => (
                <section key={s.id}>
                  <p className="text-12 text-muted">{s.chapterTitle}</p>
                  <h3 className="font-display text-17 font-semibold">{s.title}</h3>
                  <div className={cn("prose-help mt-2 text-13-5")} dangerouslySetInnerHTML={{ __html: s.html }} />
                </section>
              ))}
            </div>
          )}
          {data?.tour && !results && !stack.length && (
            <button
              type="button"
              onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("tw:tour-start", { detail: { id: data.tour } })); }}
              className="justify-self-start rounded-full bg-brand-600 px-4 py-2 text-13-5 font-semibold text-brand-on"
            >
              Take the tour
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
```

  Notes for the implementer:
  - The HTML is safe to inject because `help.json` is built from the repository's own manual by a converter that escapes everything first (Task 1's fixture pins it).
  - Use the project's existing prose styling. If `Prose` is a component wrapping `dangerouslySetInnerHTML`, use it instead of the `prose-help` class. Check `components/ui/prose.tsx` and prefer reuse.
  - `Modal` needs a `dataAttr` prop (or pass `data-help-drawer` through) so the probe can find it. Add an optional `dataAttr?: string` that renders `data-${dataAttr}=""` on the `<dialog>`.

- [ ] **Step 3: Mount it.** In `admin/(app)/layout.tsx`, put `<HelpDrawer />` in the `TopBar` children just before `<SchemeToggle …/>`, importing it from `@/components/admin/help-drawer`.

- [ ] **Step 4: Run the probe; it passes.** Run `node scripts/probes/help-drawer.mjs`. Expected: exit 0. Then run `MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin /admin/tickets`. Expected: clean (the "?" button fits at 320).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/modal.tsx web/src/components/admin/help-drawer.tsx "web/src/app/admin/(app)/layout.tsx" web/src/app/globals.css
git commit -m "help: the ? drawer — this screen's manual sections, search, in-place links"
```

---

### Task 5: Guided tours

**Files:**
- Create: `web/scripts/probes/tours.mjs` (written first)
- Modify: `web/src/lib/tours.ts` (replace the stub)
- Create: `web/src/components/ui/tour.tsx`
- Modify: both area layouts (mount `<Tour />`)
- Modify: the elements named by steps (add `data-tour="…"`). Find each with grep and add the attribute to the existing element:
  - dashboard: hero band, glance tiles container, Customise button, palette button
  - tickets: `FilterBar`, the first row, the selection checkbox, `TableView` trigger
  - builder: Add section button, first section card, Style button, preview toggle, `FormActions` save
  - media: upload button, first file, Edit button
  - settings: tab strip, first `SettingSwitch`, Save
  - portal: the hero actions, the tiles list, the help card

**Interfaces:**
- Consumes: the `tw:tour-start` event from Task 4.
- Produces:
  - `TOURS` and `tourFor(path: string): string | null` in `lib/tours.ts`
  - `<Tour />`, which auto-starts and listens for `tw:tour-start`

- [ ] **Step 1: Write the probe** `web/scripts/probes/tours.mjs`:

```js
import { chromium } from "playwright";

/**
 * Measures the guided tours (docs/help-and-tours.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/tours.mjs
 *
 * (1) The dashboard tour starts on a first visit, not on the second.
 * (2) Next and Back move through its steps; the step count changes.
 * (3) Skip stores it as done. (4) "Take the tour" in the help drawer replays
 * it. (5) A step whose target is missing is skipped. (6) Nothing starts at
 * 390px. (7) Nothing logged.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const card = page.locator("[data-tour-card]");
const go = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(3000); };

await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("tw_tour:")).forEach((k) => localStorage.removeItem(k)));
await go("/admin");
ok(await card.count() === 1, "the dashboard tour starts on a first visit");
if (await card.count() === 1) {
  const step1 = await card.locator("[data-tour-step]").textContent();
  await card.getByRole("button", { name: "Next" }).click();
  await page.waitForTimeout(400);
  const step2 = await card.locator("[data-tour-step]").textContent();
  ok(step1 !== step2, `Next moves on (${step1} → ${step2})`);
  await card.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(400);
  ok((await card.locator("[data-tour-step]").textContent()) === step1, "Back returns");
  await card.getByRole("button", { name: "Skip tour" }).click();
  await page.waitForTimeout(400);
  ok(await card.count() === 0, "Skip closes it");
  ok(await page.evaluate(() => localStorage.getItem("tw_tour:dashboard")) === "done", "Skip stores it as done");
}
await go("/admin");
ok(await card.count() === 0, "it does not start on the second visit");

await page.getByRole("button", { name: "Help for this screen" }).click();
await page.waitForTimeout(1500);
const take = page.getByRole("button", { name: "Take the tour" });
ok(await take.count() === 1, "the help drawer offers the tour");
if (await take.count() === 1) { await take.click(); await page.waitForTimeout(800); ok(await card.count() === 1, "Take the tour replays it"); await page.keyboard.press("Escape"); await page.waitForTimeout(300); ok(await card.count() === 0, "Escape ends it"); }

// A missing target: hide the Customise button's marker, replay, and count the steps shown.
await page.evaluate(() => document.querySelectorAll("[data-tour='customise']").forEach((el) => el.removeAttribute("data-tour")));
await page.evaluate(() => window.dispatchEvent(new CustomEvent("tw:tour-start", { detail: { id: "dashboard" } })));
await page.waitForTimeout(600);
const total = await card.locator("[data-tour-step]").textContent().catch(() => "");
ok(/of 3/.test(total ?? ""), `a missing target is skipped (${total})`);
await page.keyboard.press("Escape");

await page.setViewportSize({ width: 390, height: 800 });
await page.evaluate(() => localStorage.removeItem("tw_tour:dashboard"));
await go("/admin");
ok(await card.count() === 0, "nothing starts at 390px");
await page.evaluate(() => localStorage.setItem("tw_tour:dashboard", "done"));

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it; it fails** because there is no tour card.

- [ ] **Step 3: Write `lib/tours.ts`.**

```ts
/**
 * The guided tours (docs/help-and-tours.md): a few steps on the screens a new
 * person meets first, each pointing at a `data-tour` attribute. A step whose
 * target is missing or hidden is skipped, so a role without a control simply
 * sees one step fewer. No directive: the help route reads `tourFor`.
 */
export type TourStep = { target: string; title: string; body: string };
export type TourDef = { match: (path: string, search: string) => boolean; steps: TourStep[] };

export const TOURS: Record<string, TourDef> = {
  dashboard: {
    match: (p) => p === "/admin",
    steps: [
      { target: "hero", title: "What is waiting", body: "One line of what needs you today, with buttons to the lists behind it." },
      { target: "glance", title: "At a glance", body: "Each tile is a link to the list that produced its number." },
      { target: "customise", title: "Make it yours", body: "Hide panels you don't use and put the rest in your own order." },
      { target: "palette", title: "Find anything", body: "Press Ctrl K (⌘ K on a Mac) to jump to any screen, setting or record." },
    ],
  },
  tickets: {
    match: (p) => p === "/admin/tickets",
    steps: [
      { target: "filters", title: "Narrow the queue", body: "Filter by status, priority or who it's assigned to, or search by reference or subject." },
      { target: "ticket-row", title: "Open a ticket", body: "Press a row to read the conversation and reply." },
      { target: "select", title: "Act on several", body: "Tick rows to assign, re-prioritise or close them together." },
      { target: "table-view", title: "Your columns", body: "Choose the columns you want and how dense the rows are." },
    ],
  },
  builder: {
    match: (p, s) => /^\/admin\/pages\/\d+$/.test(p) && new URLSearchParams(s).get("tab") === "builder",
    steps: [
      { target: "add-section", title: "Add a section", body: "Pick from heroes, features, galleries, forms and more." },
      { target: "section-card", title: "Edit a section", body: "Open a card to change its words, pictures and links." },
      { target: "section-style", title: "Style it", body: "Spacing, width, background and how it appears, per device." },
      { target: "preview", title: "See it live", body: "The preview redraws as you type." },
      { target: "save", title: "Save", body: "Nothing goes live until you save, and History keeps every version." },
    ],
  },
  media: {
    match: (p) => p === "/admin/media",
    steps: [
      { target: "upload", title: "Add files", body: "Drop files anywhere on the page, or press Upload." },
      { target: "media-file", title: "Pick a file", body: "Select one to see its details; Shift and Ctrl select several." },
      { target: "media-edit", title: "Edit in place", body: "Crop, rotate, resize, set alt text and the focal point." },
    ],
  },
  settings: {
    match: (p) => p === "/admin/settings",
    steps: [
      { target: "settings-tabs", title: "Settings by topic", body: "Each tab is one area: contact details, sign-in, mail, API keys." },
      { target: "setting-switch", title: "Switches", body: "Slide a switch to turn a feature on or off." },
      { target: "save", title: "Save", body: "Changes apply once saved; most reach the site at once." },
    ],
  },
  portal: {
    match: (p) => p === "/portal",
    steps: [
      { target: "portal-actions", title: "Get help fast", body: "Raise a ticket, or book a visit or a meeting." },
      { target: "portal-tiles", title: "What's happening", body: "Your open tickets, orders on the way and your next appointment." },
      { target: "portal-help", title: "Find answers", body: "Search the knowledge base before raising a ticket." },
    ],
  },
};

export function tourFor(path: string, search = ""): string | null {
  for (const [id, t] of Object.entries(TOURS)) if (t.match(path, search)) return id;
  return null;
}
```

  The help route passes only the path. The builder tour therefore matches through `?tab=builder` from the client and not from the route. Rule: in the route, call `tourFor(path)` only for the five path-only tours. The builder's "Take the tour" is offered when the route is `/admin/pages/{id}`: change the builder `match` to `(p, s) => /^\/admin\/pages\/\d+$/.test(p) && (s === "" || new URLSearchParams(s).get("tab") === "builder")`, and have the tour skip silently when its first target is absent.

- [ ] **Step 4: Write `components/ui/tour.tsx`.**

```tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TOURS, tourFor, type TourStep } from "@/lib/tours";

const KEY = (id: string) => `tw:tour:${id}`.replace("tw:tour:", "tw_tour:");
const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

/**
 * Runs a guided tour (docs/help-and-tours.md): once per browser on a first
 * visit from 768px wide, or on demand from the help drawer (`tw:tour-start`).
 * One fixed frame with a huge shadow dims the page around the target; the
 * card sits below it, or above when there is no room. No movement between
 * steps — a tour is driven by Next and Back, and must feel instant.
 */
export function Tour() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [run, setRun] = useState<{ id: string; steps: (TourStep & { el: HTMLElement })[]; i: number } | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const start = useCallback((id: string) => {
    const def = TOURS[id];
    if (!def || document.querySelector("dialog[open]")) return;
    const steps = def.steps.map((s) => ({ ...s, el: document.querySelector(`[data-tour="${s.target}"]`) })).filter((s): s is TourStep & { el: HTMLElement } => visible(s.el));
    if (!steps.length) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    setRun({ id, steps, i: 0 });
  }, []);

  const finish = useCallback(() => {
    if (run) { try { localStorage.setItem(KEY(run.id), "done"); } catch { /* still closes */ } }
    setRun(null);
    returnTo.current?.focus?.();
  }, [run]);

  useEffect(() => {
    const id = tourFor(path, search);
    if (!id || window.innerWidth < 768) return;
    let seen = false;
    try { seen = localStorage.getItem(KEY(id)) === "done"; } catch { seen = true; }
    if (seen) return;
    const t = window.setTimeout(() => start(id), 1200);
    return () => window.clearTimeout(t);
  }, [path, search, start]);

  useEffect(() => {
    const onStart = (e: Event) => start((e as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("tw:tour-start", onStart);
    return () => window.removeEventListener("tw:tour-start", onStart);
  }, [start]);

  const step = run?.steps[run.i];
  useEffect(() => {
    if (!step) return;
    step.el.scrollIntoView({ block: "center" });
    const place = () => setBox(step.el.getBoundingClientRect());
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    card.current?.focus();
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [step]);

  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      if (e.key === "Tab" && card.current) {
        const f = [...card.current.querySelectorAll<HTMLElement>("button")];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, finish]);

  if (!run || !step || !box) return null;
  const pad = 6;
  const below = box.bottom + 220 < window.innerHeight;
  const left = Math.min(Math.max(12, box.left), window.innerWidth - 332);
  const top = below ? box.bottom + pad + 10 : Math.max(12, box.top - pad - 10 - 200);
  const last = run.i === run.steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      <div aria-hidden className="pointer-events-none fixed rounded-lg shadow-[0_0_0_9999px_color-mix(in_oklab,var(--color-dark)_55%,transparent)] ring-2 ring-brand-600"
        style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      <div ref={card} tabIndex={-1} data-tour-card role="dialog" aria-modal="true" aria-labelledby="tour-title"
        className="tour-card fixed w-80 rounded-xl border border-line-strong bg-card p-4 text-ink shadow-float outline-none"
        style={{ left, top }}>
        <p data-tour-step className="text-12 text-muted">Step {run.i + 1} of {run.steps.length}</p>
        <p id="tour-title" className="mt-1 text-15 font-semibold">{step.title}</p>
        <p className="mt-1 text-13-5 text-ink-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="mr-auto text-12-5 text-muted hover:text-ink">Skip tour</button>
          {run.i > 0 && <button type="button" onClick={() => setRun({ ...run, i: run.i - 1 })} className="rounded-full border border-line-strong px-3 py-1.5 text-13 font-semibold">Back</button>}
          <button type="button" onClick={() => (last ? finish() : setRun({ ...run, i: run.i + 1 }))} className="rounded-full bg-brand-600 px-3.5 py-1.5 text-13 font-semibold text-brand-on">{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
```

  Fix `KEY` to simply `` (id: string) => `tw_tour:${id}` `` (the replace above is noise). Add the card's one entrance to `globals.css` inside the no-preference guard: `.tour-card { animation: hero-in var(--duration-base) var(--ease-brand) both; }`. Reuse the existing `hero-in` keyframe, and don't re-run it per step: key the card on `run.id`, not on the step.

- [ ] **Step 5: Mount `<Tour />`** in both area layouts inside a `<Suspense fallback={null}>` (it reads `useSearchParams`), just after `<NewSincePoller />` in the console and after `<RouteProgress …/>` in the portal.

- [ ] **Step 6: Add the `data-tour` attributes** listed under Files. Keep every attribute on an element that is visible in the default state at 1280px.

- [ ] **Step 7: Run the probe; it passes.** Then run the console-shell and portal-home probes. Expected: exit 0. Their pages now also start a tour on a first visit, so before navigating, both probes must set every `tw_tour:*` to `done` in `localStorage`. Add an `addInitScript` setting `tw_tour:dashboard`, `tickets`, `builder`, `media`, `settings` and `portal` to `done`, with a comment saying why.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/tours.ts web/src/components/ui/tour.tsx web/scripts/probes "web/src/app/admin/(app)" "web/src/app/portal/(app)" web/src/app/globals.css web/src/components
git commit -m "tours: first-visit guided tours on six key screens, replayable from help"
```

---

### Task 6: Simple view

**Files:**
- Create: `web/scripts/probes/simple-view.mjs` (written first)
- Modify: `web/src/lib/console-prefs.ts` (`useConsoleSimple`, `setConsoleSimple`, key `tw_console_simple`)
- Modify: `web/src/app/layout.tsx` (the pre-paint stamp `data-console-simple`)
- Modify: `web/src/components/admin/form-tabs.tsx` (`advanced` on a `TabDef`)
- Modify: `web/src/components/admin/tabs.tsx` (the switch and the hiding)

**Interfaces:**
- Produces: `TabDef.advanced?: boolean`; `useConsoleSimple(): boolean`; `setConsoleSimple(on: boolean)`.

- [ ] **Step 1: Write the probe** `web/scripts/probes/simple-view.mjs`:

```js
import { chromium } from "playwright";

/**
 * Measures Simple view on an entity form (docs/help-and-tours.md).
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/simple-view.mjs
 *
 * On /admin/blog/new: (1) the switch hides SEO and AEO and survives a reload
 * (stamped before paint). (2) Saving with no title still shows the error and
 * keeps the form usable. (3) ?tab=seo still shows SEO. (4) Off restores the
 * tabs. Puts the preference back.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => ["dashboard", "tickets", "builder", "media", "settings"].forEach((t) => localStorage.setItem(`tw_tour:${t}`, "done")));
const page = await context.newPage();
const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const go = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(2000); };
const tab = (name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });

await go("/admin/blog/new");
ok(await tab("SEO").isVisible(), "SEO is shown by default");
const sw = page.getByRole("switch", { name: "Simple view" });
ok(await sw.count() === 1, "the Simple view switch is on the form");
if (await sw.count() === 1) {
  await sw.check();
  await page.waitForTimeout(300);
  ok(!(await tab("SEO").isVisible()) && !(await tab("AEO").isVisible()), "Simple view hides SEO and AEO");
  await go("/admin/blog/new");
  ok(await page.evaluate(() => document.documentElement.dataset.consoleSimple === "1"), "the choice is stamped before paint");
  ok(!(await tab("SEO").isVisible()), "it survives a reload");

  await page.getByRole("button", { name: /^(Save|Create|Publish)/ }).first().click();
  await page.waitForTimeout(3000);
  ok(await page.locator("[aria-invalid='true'], [role=alert]").count() >= 1, "a save with no title shows its error");

  await go("/admin/blog/new?tab=seo");
  ok(await tab("SEO").isVisible(), "?tab=seo still shows SEO");

  await go("/admin/blog/new");
  await page.getByRole("switch", { name: "Simple view" }).uncheck();
  await page.waitForTimeout(300);
  ok(await tab("SEO").isVisible(), "switching off restores the tabs");
}
await page.evaluate(() => localStorage.removeItem("tw_console_simple"));
await browser.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it; it fails** because there is no switch.

- [ ] **Step 3: `console-prefs.ts`.** Add, beside the others:

```ts
export const SIMPLE_KEY = "tw_console_simple";
export function useConsoleSimple(): boolean {
  return useSyncExternalStore(subscribe, () => read(SIMPLE_KEY, "1"), () => false);
}
export function setConsoleSimple(on: boolean) {
  try { if (on) localStorage.setItem(SIMPLE_KEY, "1"); else localStorage.removeItem(SIMPLE_KEY); } catch { /* attribute still applies */ }
  if (on) document.documentElement.dataset.consoleSimple = "1"; else delete document.documentElement.dataset.consoleSimple;
  announce();
}
```

- [ ] **Step 4: The pre-paint stamp.** In `app/layout.tsx`'s script, after the `tw_console_motion` clause, add:

```
if(a&&localStorage.getItem("tw_console_simple")==="1"){r.dataset.consoleSimple="1"}
```

- [ ] **Step 5: `form-tabs.tsx`.** Mark advanced groups:

```ts
/** Simple view hides these tabs (docs/help-and-tours.md): search metadata, answer blocks, custom fields. */
const ADVANCED_FIELDS = new Set(["seo", "answer_blocks", "custom_fields"]);
// in the map:
  const tabs: TabDef[] = groups.map((g, i) => ({
    id: g.id,
    label: g.label,
    ...(g.fields.some((f) => ADVANCED_FIELDS.has(f)) ? { advanced: true } : {}),
    ...(counts[i] ? { badge: counts[i], tone: "err" as const } : {}),
  }));
```

- [ ] **Step 6: `tabs.tsx`.**
  - Add `advanced?: boolean` to `TabDef`.
  - In `Tabs`: `const simple = useConsoleSimple();` and `const anyAdvanced = tabs.some((t) => t.advanced);`.
  - On each tab button add a class: `simple && tab.advanced && !selected && !(tab.tone === "err" && tab.badge) && "hidden"`. This uses the class, not the attribute, so it can come back.
  - When `anyAdvanced`, render at the end of the tablist row:

```tsx
<label className="ml-auto flex items-center gap-2 pb-1.5 text-12-5 text-muted">
  <Switch checked={simple} onChange={(e) => setConsoleSimple(e.target.checked)} aria-label="Simple view" />
  Simple view
</label>
```

  Import `Switch` from `@/components/ui/switch` (check its props: it is the `role="switch"` checkbox) and the two hooks from `@/lib/console-prefs`. `useConsoleSimple`'s server snapshot is `false`, so the first render matches the server. The pre-paint attribute exists for a CSS rule that hides advanced tabs before hydration; add to `globals.css`:

```css
/* Simple view (docs/help-and-tours.md): advanced tabs are hidden before hydration
   too, so the strip does not flash them. Never the selected tab or one with an error. */
html[data-console-simple] [role="tablist"] [data-advanced]:not([aria-selected="true"], [data-has-error]) { display: none; }
```

  Then put `data-advanced` and `data-has-error` on the tab buttons, and drop the React `hidden` class. The CSS rule alone does the hiding, before and after hydration, so the switch only toggles the `<html>` attribute through `setConsoleSimple`.

- [ ] **Step 7: Run the probe; it passes.** Also run `node scripts/probes/form-guard.mjs` and `node scripts/probes/form-draft.mjs`. Expected: both pass unchanged.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/console-prefs.ts web/src/app/layout.tsx web/src/components/admin/form-tabs.tsx web/src/components/admin/tabs.tsx web/src/app/globals.css web/scripts/probes/simple-view.mjs
git commit -m "forms: Simple view hides SEO, AEO and custom fields — never an error or ?tab"
```

---

### Task 7: Empty states with a next step

**Files:**
- Create: `web/src/components/admin/empty-list-action.tsx`
- Modify: about 45 console index pages, found by the script in Step 1

**Interfaces:**
- Produces: `EmptyListAction({ filtered, clearHref, newHref, noun }: { filtered: boolean; clearHref: string; newHref?: string; noun: string })`, which returns a `ButtonLink` or null.

- [ ] **Step 1: List the targets.** Write and run a throwaway `web/scripts/_empty-targets.mjs` that prints each `app/admin/(app)/**/page.tsx` with an `<EmptyState` lacking `action=`, and whether a sibling `new/page.tsx` exists. Save the list in the scratchpad.

- [ ] **Step 2: Write the component.**

```tsx
import { ButtonLink } from "@/components/ui/button";

/**
 * The next step under an empty console list (docs/help-and-tours.md):
 * "Clear filters" when filters hid everything, "Add the first …" when the
 * list is truly empty and the screen has a "new" route, nothing otherwise.
 */
export function EmptyListAction({ filtered, clearHref, newHref, noun }: {
  filtered: boolean; clearHref: string; newHref?: string; noun: string;
}) {
  if (filtered) return <ButtonLink href={clearHref} variant="secondary" size="sm">Clear filters</ButtonLink>;
  if (newHref) return <ButtonLink href={newHref} size="sm">Add the first {noun}</ButtonLink>;
  return null;
}
```

- [ ] **Step 3: Apply it, one page at a time,** following `jobs/page.tsx` as the pattern:

```tsx
<EmptyState
  icon={<IconTeam />}
  title={filtered ? "No vacancies match those filters" : "No vacancies yet"}
  action={<EmptyListAction filtered={filtered} clearHref="/admin/jobs" newHref="/admin/jobs/new" noun="vacancy" />}
>
```

  - Where a page has no `filtered` variable, add one from its own query params: `const filtered = Boolean(params.q || params.status /* …that page's filters */);`.
  - For pages with nothing to create (activity, client errors, chat conversations, unanswered, submissions, registrations, comments, leads), pass no `newHref`; the sentence already says what appears there. Check the wording does say so.
  - Every `noun` is singular and lower-case: "vacancy", "post", "page", "product", "brand"…

- [ ] **Step 4: Verify.** Run `npx tsc --noEmit && npm run lint`, then audit a sample of five changed index screens in light and dark. Each lists records today, so an empty state is not drawn; to see one, add `?q=zzzzzz`, which shows the filtered state and its "Clear filters" button:

```bash
MSYS_NO_PATHCONV=1 node scripts/audit.mjs "/admin/jobs?q=zzzzzz" "/admin/blog?q=zzzzzz" "/admin/products?q=zzzzzz" "/admin/brands?q=zzzzzz" "/admin/events?q=zzzzzz"
```

  Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/empty-list-action.tsx "web/src/app/admin/(app)"
git commit -m "console: every empty list says what to do next — add the first, or clear filters"
```

---

### Task 8: Release gate, docs, verification and 0.168.0

**Files:**
- Modify: `release/build.mjs` (run the help check before the web build)
- Modify: `release/RELEASING.md` (a line: run `npm run help` after editing the manual)
- Create: `docs/help-and-tours.md`; modify `CLAUDE.md` (module entry and lines)
- Modify: `VERSION.md`, `web/src/lib/version.ts` (0.168.0, covering the Themes rows and the assistant header colour committed since 0.167.0)

- [ ] **Step 1: The release gate.** In `release/build.mjs`, just before the `log("Web: npm ci + portable build")` line, add:

```js
// The help drawer is built from manual/ (docs/help-and-tours.md); a manual
// edited without `npm run help` would ship stale help, so refuse to build.
run("node scripts/build-help.mjs --check", join(ROOT, "web"));
```

  Use whichever path-join helper and root constant the file already uses (`grep -n "const ROOT\|join(" release/build.mjs`).

- [ ] **Step 2: Docs.** Write `docs/help-and-tours.md` with one section per rule and its reason:
  - `help.json` is built and checked, never hand-edited
  - the converter escapes first
  - the routes self-check
  - the route is staff-only and server-side
  - the `?` key skips fields
  - tours skip missing targets, run from 768px and never move between steps
  - Simple view never hides an error or `?tab`, and hides before paint
  - `EmptyListAction`

  Add the CLAUDE.md "Modules" entry and the matching one-liners.

- [ ] **Step 3: Full verification.**

```bash
cd web
node scripts/help-convert.check.mjs
node --experimental-strip-types scripts/help-routes.check.mjs
node scripts/build-help.mjs --check
npx tsc --noEmit && npm run lint
node scripts/probes/help-drawer.mjs
node scripts/probes/tours.mjs
node scripts/probes/simple-view.mjs
node scripts/probes/console-shell.mjs
node scripts/probes/portal-home.mjs
npm run audit            # ADMIN_LOGIN_* and PORTAL_LOGIN_* set; light
AUDIT_SCHEME=dark npm run audit
npm run audit:mobile
```

  Expected: every command exits 0. Then check by eye at 390 and 1280: the open drawer, a tour step, a form in Simple view, an empty list. Run one probe at a time (one account each), then delete the throwaway accounts.

- [ ] **Step 4: Version.** VERSION.md entry for 0.168.0 (newest first, today's date), plus `APP_VERSION = "0.168.0"`.

- [ ] **Step 5: Commit**

```bash
git add release/build.mjs release/RELEASING.md docs/help-and-tours.md CLAUDE.md VERSION.md web/src/lib/version.ts
git commit -m "0.168.0: simple to use — help drawer, guided tours, Simple view, empty states"
```

---

## Self-review notes

- **Spec coverage:**
  - help: Tasks 1–4
  - tours: Task 5
  - Simple view: Task 6
  - empty states: Task 7
  - release gate and docs: Task 8
- **Types:** `Section`, `helpIdsFor`, `tourFor(path, search?)`, `TabDef.advanced`, `useConsoleSimple`/`setConsoleSimple`, `EmptyListAction` and the `tw:help`/`tw:tour-start` events are used consistently across tasks.
- **Interface rulings in the plan itself:**
  - `tourFor` takes an optional `search`.
  - The help route calls it with the path only.
  - The builder tour also matches a bare `/admin/pages/{id}` and skips when its targets are absent.
  - Simple view hides by CSS on `<html data-console-simple>`, so the strip never flashes.
