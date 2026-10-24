/**
 * The footer's six social styles (0.191.0, docs/site-chrome.md): flip, dock,
 * circles, outline, pills, minimal - on every theme, at 360 and 1280, in light
 * and dark.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/social-styles.mjs
 *   STYLES=circles,pills  THEMES=classic,launch  node …   limits the run.
 *
 * For each style it saves `social_style` through the console's own settings
 * form (the action calls `updateTag("settings")`, so the site shows the new
 * value at once instead of after the 10-minute settings cache) and then, on
 * /theme-preview/<id> for every theme in themes/manifests.ts at 360x800 and
 * 1280x800, light and dark (both scheme keys written before the page loads):
 *   - the footer's social links exist (and, but for dock, include Email);
 *   - each is at least 24x24;
 *   - documentElement.scrollWidth <= innerWidth;
 *   - hovering the first one changes a computed style (the link, its parent,
 *     first child, svg, ::before or ::after);
 *   - with reducedMotion 'reduce' no transition or animation is set on any
 *     of those.
 *
 * A killed run can leave a style saved: ORIGINAL_STYLE=flip puts it back.
 *
 * SHOTS=<dir> also writes a screenshot of each footer, the first link hovered.
 *
 * Only the social keys are posted (the rest of the settings form is taken
 * out of the DOM for the press), and the original style and profile URLs are
 * put back at the end - also on failure. Profile URLs are filled with
 * example addresses only while fewer than four are set. Signs in only through
 * ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD; use a throwaway administrator.
 */
process.env.BASE ??= "http://localhost:3000";
const { chromium } = await import("playwright");
const { signInAsStaff, BASE } = await import("../shared.mjs");
const { readFileSync } = await import("node:fs");

const T = 400000;
const API = process.env.API_BASE ?? "http://127.0.0.1:8000/api/v1";
const ALL_STYLES = ["flip", "dock", "circles", "outline", "pills", "minimal"];
const STYLES = (process.env.STYLES ?? "").split(",").filter(Boolean);
const only = STYLES.length ? STYLES : ALL_STYLES;
const manifest = readFileSync(new URL("../../src/themes/manifests.ts", import.meta.url), "utf8");
const themeIds = [...manifest.matchAll(/import \{ (\w+)Manifest \}/g)].map((m) => m[1]).filter((id) => id !== "");
const THEMES = (process.env.THEMES ?? "").split(",").filter(Boolean);
const themes = THEMES.length ? THEMES : themeIds;
const KEYS = ["social_linkedin", "social_x", "social_facebook", "social_instagram", "social_youtube", "social_whatsapp", "social_reddit"];
const EXAMPLE = Object.fromEntries(KEYS.map((k) => [k, `https://example.com/${k.replace("social_", "")}`]));
// Pages in flight at once. The dev API answers one request at a time, so more than 1 can queue past any timeout.
const CONC = Number(process.env.CONCURRENCY ?? 1);
const pool = async (items, n, fn) => { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { for (let it; (it = q.shift());) await fn(it); })); };
const SIZES = [{ w: 360, h: 800 }, { w: 1280, h: 800 }];
const SCHEMES = ["light", "dark"];

const browser = await chromium.launch();
let failed = 0;
const fails = [];
const ok = (c, l) => { if (!c) { failed++; fails.push(l); console.log(`FAIL ${l}`); } };

/** Open the social tab's form, post only the given values. */
async function save(page, values) {
  await page.goto(`${BASE}/admin/settings?tab=social`, { waitUntil: "domcontentloaded", timeout: T });
  await page.waitForSelector('[name="setting__social_style"]', { state: "attached", timeout: T });
  const current = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, document.querySelector(`[name="setting__${k}"]`)?.value ?? ""])), ["social_style", ...KEYS]);
  if (!values) return current;
  for (const [k, v] of Object.entries(values)) {
    const el = page.locator(`[name="setting__${k}"]`).first();
    const tag = await el.evaluate((e) => e.tagName);
    // Until React has hydrated the form it puts a controlled value straight back: set it until it stays.
    for (let i = 0; ; i++) {
      if (tag === "SELECT") await el.selectOption(v);
      else await el.fill(v, { force: true });
      if ((await el.inputValue()) === v) break;
      if (i > 60) throw new Error(`${k} would not take ${v}`);
      await page.waitForTimeout(2000);
    }
  }
  // Take every other setting out of the form for this press.
  await page.evaluate(([keep]) => {
    document.querySelectorAll('[name^="setting__"]').forEach((e) => { if (!keep.includes(e.name)) e.remove(); });
  }, [Object.keys(values).map((k) => `setting__${k}`)]);
  await page.locator('button[type="submit"]:has-text("Save settings")').first().click({ force: true });
  // The API says when it has the values; a toast is too easy to miss on a slow machine.
  const deadline = Date.now() + 600000;
  for (;;) {
    const got = (await fetch(`${API}/settings`).then((r) => r.json()).catch(() => null))?.data;
    if (got && Object.entries(values).every(([k, v]) => (got[k] ?? "") === v)) break;
    if (Date.now() > deadline) throw new Error(`the API never showed ${JSON.stringify(values)}`);
    await page.waitForTimeout(2000);
  }
  return current;
}

const admin = await browser.newPage();
admin.setDefaultTimeout(T);
await signInAsStaff(admin);
const original = await save(admin, null);
console.log("original:", JSON.stringify(original));
const needUrls = KEYS.filter((k) => original[k]).length < 4;
const filledUrls = needUrls ? Object.fromEntries(KEYS.filter((k) => !original[k]).map((k) => [k, EXAMPLE[k]])) : {};

/** The state vector one hover is compared on. */
const STATE = (el) => {
  const kids = [el, el.parentElement, el.firstElementChild, el.querySelector("svg"), el.querySelector(".social-flip__card")].filter(Boolean);
  const props = ["translate", "scale", "rotate", "opacity", "color", "backgroundColor", "borderColor", "boxShadow", "width", "height"];
  const out = [];
  for (const k of kids) for (const ps of [null, "::before", "::after"]) {
    const cs = getComputedStyle(k, ps);
    out.push(props.map((p) => cs[p]).join("|"));
  }
  return out.join("~");
};
const MOTION = (els) => {
  const bad = [];
  const all = els.flatMap((el) => [el, ...el.querySelectorAll("*")]);
  for (const k of all) for (const ps of [null, "::before", "::after"]) {
    const cs = getComputedStyle(k, ps);
    const t = cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0) && cs.transitionProperty !== "none";
    const a = cs.animationName !== "none" && cs.animationName !== "";
    if (t || a) bad.push((k.tagName + (k.className && k.className.baseVal === undefined ? "." + k.className : "")).slice(0, 60) + (ps ?? ""));
  }
  return bad;
};
const LINKS = () => {
  const re = /( on (LinkedIn|X|Facebook|Instagram|YouTube|WhatsApp|Reddit)|^Email )/;
  return [...document.querySelectorAll("footer a[aria-label]")].filter((a) => re.test(a.getAttribute("aria-label")));
};

const summary = [];
try {
  // A cold dev server compiles each theme's chunks on its first request, and four at once
  // queue behind each other past any sensible timeout: warm every theme one by one first.
  for (const id of themes) {
    const t0 = Date.now();
    await admin.goto(`${BASE}/theme-preview/${id}`, { waitUntil: "domcontentloaded", timeout: 600000 }).catch((e) => console.log(`warm ${id}: ${e.message}`.slice(0, 160)));
    await admin.waitForSelector("footer", { timeout: 600000 }).catch(() => {});
    console.log(`warm ${id}: ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  if (Object.keys(filledUrls).length) await save(admin, filledUrls);
  for (const style of only) {
    await save(admin, { social_style: style });
    const tally = { checked: 0, links: new Set() };
    const contexts = [];
    for (const size of SIZES) for (const scheme of SCHEMES) {
      // /theme-preview is staff-only, so the staff session rides in on each context.
      const ctx = await browser.newContext({ storageState: await admin.context().storageState(), viewport: { width: size.w, height: size.h }, colorScheme: scheme });
      await ctx.addInitScript((s) => { try { localStorage.setItem("tw_scheme_site", s); localStorage.setItem("tw_scheme_console", s); } catch {} }, scheme);
      const page = await ctx.newPage();
      page.setDefaultTimeout(T);
      contexts.push({ ctx, page, size, scheme });
    }
    for (const id of themes) {
      await pool(contexts, CONC, async ({ page, size, scheme }) => {
        const tag = `${style} ${id} ${size.w} ${scheme}`;
        // A slow dev server times a navigation out now and then: one more go.
        for (const attempt of [1, 2]) try {
          await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: scheme });
          await page.goto(`${BASE}/theme-preview/${id}`, { waitUntil: "domcontentloaded", timeout: T });
          await page.waitForSelector("footer a[aria-label]", { timeout: T });
          await page.locator("footer").first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          const handles = await page.evaluateHandle(LINKS);
          const n = await handles.evaluate((a) => a.length);
          ok(n >= (style === "dock" ? 4 : 5), `${tag}: ${n} social links`);
          if (!n) return;
          tally.links.add(n);
          const small = await handles.evaluate((a) => a.map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("aria-label"), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w < 24 || h < 24));
          ok(small.length === 0, `${tag}: under 24px ${JSON.stringify(small)}`);
          if (style !== "dock") ok(await handles.evaluate((a) => a.some((e) => /^Email /.test(e.getAttribute("aria-label")))), `${tag}: no Email link`);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          ok(over <= 0, `${tag}: page scrolls sideways by ${over}px`);
          const first = await handles.evaluateHandle((a) => a[0]);
          await first.evaluate((e) => e.scrollIntoView({ block: "center" }));
          await page.mouse.move(0, 0);
          await page.waitForTimeout(500);
          const before = await first.evaluate(STATE);
          // Hover through the real pointer at the link's centre, and say what is there if the link is not under it.
          let under = "";
          for (let i = 0; i < 3; i++) {
            await first.scrollIntoViewIfNeeded();
            const box = await first.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
            await page.waitForTimeout(300);
            under = await first.evaluate((e) => { if (e.matches(":hover")) return ""; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t ? `${t.tagName}.${String(t.className).slice(0, 40)}` : "nothing"; });
            if (!under) break;
          }
          if (under) console.log(`note ${tag}: pointer landed on ${under}`);
          await page.waitForTimeout(1300);
          const after = await first.evaluate(STATE);
          if (process.env.SHOTS) await first.evaluateHandle((e) => e.closest("footer")).then((f) => f.asElement().screenshot({ path: `${process.env.SHOTS}/${style}-${id}-${size.w}-${scheme}.png` }));
          ok(before !== after, `${tag}: hover changed nothing`);
          await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
          await page.waitForTimeout(100);
          const bad = await handles.evaluate(MOTION);
          ok(bad.length === 0, `${tag}: motion under reduce ${JSON.stringify(bad.slice(0, 3))}`);
          tally.checked++;
          break;
        } catch (e) {
          if (attempt === 1 && /goto|Timeout|ERR_/.test(e.message)) continue;
          ok(false, `${tag}: ${String(e.message).split("\n")[0]}`);
          break;
        }
      });
    }
    for (const c of contexts) await c.ctx.close();
    summary.push(`${style}: ${tally.checked}/${themes.length * contexts.length} pages checked, link counts ${[...tally.links].join("/")}`);
    console.log(summary.at(-1));
  }
} finally {
  // ORIGINAL_STYLE names the style to put back when a killed run left another one saved.
  const back = { social_style: process.env.ORIGINAL_STYLE || original.social_style || "flip" };
  for (const k of Object.keys(filledUrls)) back[k] = "";
  await save(admin, back).catch((e) => console.log("RESTORE FAILED", e.message));
  console.log("restored:", JSON.stringify(back));
  await browser.close();
}
console.log(summary.join("\n"));
console.log(failed ? `${failed} failure(s)` : "all ok");
process.exit(failed ? 1 : 0);
