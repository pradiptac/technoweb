/**
 * Fluid motion (0.192.0, docs/motion.md "Fluid motion"): the `motion_feel`
 * and `motion_text` settings and the new button, card and small-interaction
 * ids. Classic and one other theme, at 1280 and at a 390px phone.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/fluid-motion.mjs
 *   OTHER_THEME=launch  BASE=http://localhost:3000  node …
 *
 * Two real saves through the console's Motion tab (the action calls
 * `updateTag("settings")`, so the site shows the values at once): first
 * feel=fluid, text=wave, buttons=spring, cards=spring, micro=fluid, then
 * buttons=magnetic. Each time the probe checks the stamped `data-motion-*`
 * attributes on `.public-site`. The CSS variants that need no new save (the
 * rise and blur headings) are read by setting the attribute on the wrapper,
 * which is all the rules key on. Checked, with the pointer on /theme-preview/<id>:
 *   - fluid feel: --ease-brand is the spring, --duration-base is 320ms;
 *   - spring button: hover translate overshoots past -2px mid-flight, a press
 *     squashes to .95 and the release scale overshoots past 1;
 *   - spring card: hover translate overshoots past -6px mid-flight;
 *   - magnetic button: translate is non-zero with the pointer at the edge and
 *     back to none after leaving;
 *   - a revealed heading's words (injected into the page, so it does not rely
 *     on a builder page existing) start hidden and end at opacity 1, no
 *     translate, no filter, for rise, blur and wave; wave overshoots;
 *   - a real theme section heading (SectionHeader's h2, no word spans) under
 *     /theme-preview/classic at 1280, wave: in a revealed [data-aos] it starts
 *     hidden and moves when revealed; with none above it, it arrives on its
 *     view timeline (mid-scroll it is part-way) - and either way ends at
 *     opacity 1 with no translate and no filter;
 *   - under reducedMotion 'reduce' the words are visible at once, nothing
 *     transitions and data-aos-ready is not set;
 *   - scrollWidth <= innerWidth and no console error or page error.
 *
 * The original motion settings are put back at the end - also on failure.
 * A killed run can leave them changed: RESTORE=1 puts the shipped defaults back.
 * Signs in only through ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD; use a
 * throwaway administrator.
 */
process.env.BASE ??= "http://localhost:3000";
const { chromium } = await import("playwright");
const { signInAsStaff, BASE } = await import("../shared.mjs");

const T = 400000;
const API = process.env.API_BASE ?? "http://127.0.0.1:8000/api/v1";
const OTHER = process.env.OTHER_THEME ?? "launch";
const THEMES = ["classic", OTHER];
const KEYS = ["motion_feel", "motion_text", "motion_buttons", "motion_cards", "motion_micro"];
const DEFAULTS = { motion_feel: "standard", motion_text: "none", motion_buttons: "lift", motion_cards: "lift", motion_micro: "lively" };

const browser = await chromium.launch();
const admin = await browser.newPage();
admin.setDefaultTimeout(T);
const original = Object.fromEntries(KEYS.map((k) => [k, null]));
let failed = 0;
const ok = (c, l) => { if (!c) { failed++; console.log(`FAIL ${l}`); } else console.log(`ok   ${l}`); };
const publicSettings = async () => (await fetch(`${API}/settings`).then((r) => r.json())).data;

/** Post only the given Motion-tab choices. */
async function save(page, values) {
  await page.goto(`${BASE}/admin/site/settings?tab=motion`, { waitUntil: "load", timeout: T });
  await page.waitForSelector('input[name="setting__motion_buttons"]', { state: "attached", timeout: T });
  // Until React has hydrated the picker it puts its own state back: choose until it stays.
  for (const [k, v] of Object.entries(values)) {
    const el = page.locator(`input[name="setting__${k}"][value="${v}"]`);
    for (let i = 0; ; i++) {
      await el.check({ force: true }).catch(() => {});
      if (await el.isChecked()) break;
      if (i > 60) throw new Error(`${k} would not take ${v}`);
      await page.waitForTimeout(2000);
    }
  }
  await page.evaluate((keep) => {
    document.querySelectorAll('[name^="setting__"]').forEach((e) => { if (!keep.includes(e.name)) e.remove(); });
  }, Object.keys(values).map((k) => `setting__${k}`));
  await page.locator('button[type="submit"]:has-text("Save site settings")').first().click({ force: true });
  const deadline = Date.now() + 600000;
  for (;;) {
    const got = await publicSettings().catch(() => null);
    if (got && Object.entries(values).every(([k, v]) => (got[k] ?? "") === v)) break;
    if (Date.now() > deadline) throw new Error(`the API never showed ${JSON.stringify(values)}`);
    await page.waitForTimeout(2000);
  }
}

const num = (s, axis = "y") => {
  if (!s || s === "none") return 0;
  const n = s.split(/\s+/).map((x) => parseFloat(x));
  return axis === "x" ? n[0] : (n[1] ?? 0);
};

async function newPage(w, reduce = false) {
  // /theme-preview is a staff page: carry the console's sign-in over.
  const ctx = await browser.newContext({
    storageState: await admin.context().storageState(),
    viewport: { width: w, height: 900 },
    ...(w < 500 ? { isMobile: true, hasTouch: true } : {}),
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("tw_splash", "1"); localStorage.setItem("tw_scheme_site", "light"); } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.__errors = errors;
  return page;
}

async function open(page, theme) {
  await page.goto(`${BASE}/theme-preview/${theme}`, { waitUntil: "load", timeout: 600000 });
  await page.waitForSelector(".public-site", { timeout: 600000 });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-aos-ready") || matchMedia("(prefers-reduced-motion: reduce)").matches, null, { timeout: 120000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

/** Sample a computed property of a selector for `ms`; resolves to the list. */
const startSampler = (page, selector, prop, ms) => page.evaluate(([sel, p, t]) => {
  const el = document.querySelector(sel);
  window.__sample = new Promise((res) => {
    const out = []; const t0 = performance.now();
    (function f() { out.push(getComputedStyle(el)[p]); if (performance.now() - t0 < t) requestAnimationFrame(f); else res(out); })();
  });
}, [selector, prop, ms]);
const endSampler = (page) => page.evaluate(() => window.__sample);

/** Tag the first visible element of `selector` so later calls can name it. */
async function pick(page, selector, tag) {
  return page.evaluate(([sel, t]) => {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 20 && r.height > 20 && cs.visibility === "visible" && !el.closest("header, footer, [data-cookie-banner]")) {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        el.setAttribute("data-probe", t);
        return true;
      }
    }
    return false;
  }, [selector, tag]);
}
const centre = (page, tag, dx = 0.5, dy = 0.5) => page.evaluate(([t, x, y]) => {
  const r = document.querySelector(`[data-probe="${t}"]`).getBoundingClientRect();
  return { x: r.left + r.width * x, y: r.top + r.height * y };
}, [tag, dx, dy]);

const attrs = (page) => page.evaluate(() => {
  const w = document.querySelector(".public-site");
  return Object.fromEntries([...w.attributes].filter((a) => a.name.startsWith("data-motion-")).map((a) => [a.name, a.value]));
});

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const WORDS = `
<section data-probe-heading data-aos="fade-up" style="margin-top:140vh;padding:40px 16px;min-height:200px">
  <h2 data-section-heading class="display-2"><span data-word style="--w:0">Springs</span> <span data-word style="--w:1">make</span> <span data-word style="--w:2">headings</span> <span data-word style="--w:3">move</span></h2>
</section>`;

async function headings(page, label, styles) {
  for (const style of styles) {
    // A fresh section per style: reveals fire once. React may have re-rendered the wrapper, so put it back if it went.
    // The wrapper is ours, on <body>: the rules key only on [data-motion-text], and a theme's own tree is React's to re-render.
    await page.evaluate(([s, html]) => {
      document.querySelector("[data-probe-host]")?.remove();
      document.body.insertAdjacentHTML("beforeend", `<div data-probe-host data-motion-text="${s}">${html}</div>`);
      window.scrollTo({ top: 0, behavior: "instant" });
    }, [style, WORDS]);
    await page.waitForTimeout(500);
    const hidden = await page.evaluate(() => getComputedStyle(document.querySelector("[data-probe-heading] [data-word]")).opacity);
    ok(hidden === "0", `${label} ${style}: words are hidden before the section is revealed (opacity ${hidden})`);
    await page.evaluate(() => document.querySelector("[data-probe-heading]").scrollIntoView({ block: "center", behavior: "instant" }));
    await startSampler(page, "[data-probe-heading] [data-word]:nth-child(1)", "translate", 1200);
    const mid = await endSampler(page);
    await page.waitForTimeout(600);
    const end = await page.evaluate(() => [...document.querySelectorAll("[data-probe-heading] [data-word]")].map((w) => {
      const cs = getComputedStyle(w); return { o: cs.opacity, t: cs.translate, f: cs.filter };
    }));
    ok(end.every((w) => w.o === "1" && (w.t === "none" || w.t === "0px") && w.f === "none"), `${label} ${style}: words end at opacity 1, no translate, no filter ${JSON.stringify(end[0])}`);
    if (style === "wave") ok(Math.min(...mid.map((m) => num(m))) < -0.5, `${label} wave: the first word overshoots past rest (min y ${Math.min(...mid.map((m) => num(m))).toFixed(2)}px)`);
  }
}

async function run(theme, w, phase) {
  const label = `${theme}@${w}`;
  const page = await newPage(w);
  await open(page, theme);
  const a = await attrs(page);

  if (phase === "spring") {
    ok(a["data-motion-feel"] === "fluid" && a["data-motion-text"] === "wave" && a["data-motion-buttons"] === "spring" && a["data-motion-cards"] === "spring" && a["data-motion-micro"] === "fluid", `${label}: wrapper stamps the saved values ${JSON.stringify(a)}`);
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".public-site"));
      return { ease: cs.getPropertyValue("--ease-brand").trim(), base: cs.getPropertyValue("--duration-base").trim(), slow: cs.getPropertyValue("--duration-slow").trim(), exit: cs.getPropertyValue("--ease-exit").trim() };
    });
    ok(/linear\(|cubic-bezier\(\.34/.test(tokens.ease) && /^(320ms|\.32s)$/.test(tokens.base) && /^(450ms|\.45s)$/.test(tokens.slow), `${label}: fluid feel remaps the tokens ${JSON.stringify({ ...tokens, ease: tokens.ease.slice(0, 20) })}`);
    ok(tokens.exit.startsWith("cubic-bezier(.4"), `${label}: --ease-exit is left alone`);

    // Spring button: hover overshoot, press squash, release overshoot.
    if (await pick(page, "main .btn:not(:disabled)", "btn")) {
      await page.mouse.move(2, 2);
      await page.waitForTimeout(800);
      const c = await centre(page, "btn");
      await startSampler(page, '[data-probe="btn"]', "translate", 1000);
      await page.mouse.move(c.x, c.y, { steps: 2 });
      const hover = (await endSampler(page)).map((v) => num(v));
      if (w >= 500) ok(Math.min(...hover) < -2.1 && Math.abs(hover.at(-1) + 2) < 0.3, `${label}: spring button rises past -2px then settles (min ${Math.min(...hover).toFixed(2)}, end ${hover.at(-1)})`);
      await page.mouse.down();
      await page.waitForTimeout(300);
      const pressed = await page.evaluate(() => getComputedStyle(document.querySelector('[data-probe="btn"]')).scale);
      ok(Math.abs(parseFloat(pressed) - 0.95) < 0.01, `${label}: press squashes to .95 (${pressed})`);
      await startSampler(page, '[data-probe="btn"]', "scale", 1000);
      await page.mouse.up().catch(() => {});
      const rel = (await endSampler(page)).map((v) => (v === "none" ? 1 : parseFloat(v))).filter((v) => !Number.isNaN(v));
      ok(Math.max(...rel) > 1.001, `${label}: release springs back past 1 (max ${Math.max(...rel).toFixed(4)})`);
      await page.mouse.move(2, 2);
    } else ok(false, `${label}: found a button`);

    // Spring card (a pointer, so not on the phone). A theme's own entrance can hold the first hover, so up to three tries.
    if (w >= 500) {
      if (await pick(page, "main [data-card], main [data-tile]", "card")) {
        let result = null;
        for (let attempt = 0; attempt < 3 && !result?.pass; attempt++) {
          await page.mouse.move(2, 2);
          await page.waitForTimeout(1000);
          const c = await centre(page, "card", 0.5, 0.3);
          await startSampler(page, '[data-probe="card"]', "translate", 1000);
          await page.mouse.move(c.x, c.y, { steps: 2 });
          const hover = (await endSampler(page)).map((v) => num(v));
          // A late layout shift can move the card from under a parked pointer: that is not the rule failing.
          const held = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-probe="card"]'), [c.x, c.y]);
          result = { pass: Math.min(...hover) < -6.2 && (!held || Math.abs(hover.at(-1) + 6) < 0.3), min: Math.min(...hover), end: hover.at(-1), held };
        }
        ok(result.pass, `${label}: spring card rises past -6px then settles (min ${result.min.toFixed(2)}, end ${result.end}${result.held ? "" : ", pointer left the card"})`);
        const imgScale = await page.evaluate(() => { const i = document.querySelector('[data-probe="card"] img'); return i ? getComputedStyle(i).scale : "no image"; });
        console.log(`     card picture scale at rest after hover: ${imgScale}`);
        await page.mouse.move(2, 2);
      } else ok(false, `${label}: found a card`);
    }

    await headings(page, label, ["rise", "blur", "wave"]);
  }

  if (phase === "magnetic" && w >= 500) {
    ok(a["data-motion-buttons"] === "magnetic", `${label}: wrapper stamps magnetic`);
    if (await pick(page, "main .btn:not(:disabled)", "btn")) {
      await page.mouse.move(2, 2);
      await page.waitForTimeout(800);
      const edge = await centre(page, "btn", 0.95, 0.5);
      await page.mouse.move(edge.x - 40, edge.y, { steps: 3 });
      await page.mouse.move(edge.x, edge.y, { steps: 6 });
      await page.waitForTimeout(900);
      const t = await page.evaluate(() => getComputedStyle(document.querySelector('[data-probe="btn"]')).translate);
      ok(Math.abs(num(t, "x")) > 1.5 && Math.abs(num(t, "x")) <= 6.5, `${label}: magnetic button drifts towards the pointer (${t})`);
      await page.mouse.move(2, 2);
      await page.waitForTimeout(1200);
      const back = await page.evaluate(() => getComputedStyle(document.querySelector('[data-probe="btn"]')).translate);
      ok(back === "none" || back === "0px" || back === "0px 0px", `${label}: and returns to rest after leaving (${back})`);
    } else ok(false, `${label}: found a button`);
  }

  ok(await noOverflow(page), `${label}: ${phase} no horizontal overflow`);
  ok(page.__errors.length === 0, `${label}: ${phase} no console or page errors ${page.__errors.join(" | ").slice(0, 200)}`);
  await page.context().close();
}

/** A real SectionHeader heading: no word spans, found by its classes. */
async function themeHeading(theme, w) {
  const label = `${theme}@${w} theme heading`;
  const page = await newPage(w);
  await open(page, theme);
  const SEL = "main h2.display-2.mt-3\\.5.text-balance:not([data-section-heading])";
  const info = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((h) => h.getBoundingClientRect().top + scrollY > innerHeight * 1.5 && !h.closest("[data-headline], [data-reveal-static]"));
    if (!el) return null;
    el.setAttribute("data-probe", "th");
    return { aos: !!el.closest("[data-aos]"), text: el.textContent.slice(0, 40) };
  }, SEL);
  if (!info) { console.log(`skip ${label}: no section heading below the first screen on this page`); await page.context().close(); return; }
  console.log(`     ${label}: "${info.text}" ${info.aos ? "inside a [data-aos] reveal" : "with no [data-aos] above it"}`);
  const read = () => page.evaluate(() => { const cs = getComputedStyle(document.querySelector('[data-probe="th"]')); return { o: cs.opacity, t: cs.translate, f: cs.filter }; });
  const top = (frac) => page.evaluate((f) => { const r = document.querySelector('[data-probe="th"]').getBoundingClientRect(); scrollTo({ top: scrollY + r.top - innerHeight * f, behavior: "instant" }); }, frac);
  if (info.aos) {
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(300);
    ok((await read()).o === "0", `${label}: hidden before its section is revealed`);
    await page.evaluate(() => document.querySelector('[data-probe="th"]').scrollIntoView({ block: "center", behavior: "instant" }));
    await startSampler(page, '[data-probe="th"]', "translate", 1500);
    const mid = await endSampler(page);
    ok(Math.max(...mid.map((m) => Math.abs(num(m)))) > 0.5, `${label}: moves while arriving (max |y| ${Math.max(...mid.map((m) => Math.abs(num(m)))).toFixed(2)}px)`);
  } else {
    await top(0.88);
    await page.waitForTimeout(400);
    const m = await read();
    ok(parseFloat(m.o) < 1 && num(m.t) !== 0, `${label}: part-way mid-scroll (opacity ${m.o}, translate ${m.t})`);
    await top(0.5);
  }
  await page.waitForTimeout(1500);
  const e = await read();
  ok(e.o === "1" && (e.t === "none" || e.t === "0px") && e.f === "none", `${label}: ends at opacity 1, no translate, no filter ${JSON.stringify(e)}`);
  ok(await noOverflow(page), `${label}: no horizontal overflow`);
  ok(page.__errors.length === 0, `${label}: no console or page errors ${page.__errors.join(" | ").slice(0, 200)}`);
  await page.context().close();
}

async function reduced(theme) {
  const label = `${theme}@1280 reduced`;
  const page = await newPage(1280, true);
  await open(page, theme);
  await page.evaluate((html) => document.body.insertAdjacentHTML("beforeend", `<div data-motion-text="wave">${html}</div>`), WORDS);
  const r = await page.evaluate(() => {
    const w = document.querySelector("[data-probe-heading] [data-word]");
    const b = document.querySelector("main .btn");
    return {
      ready: document.documentElement.hasAttribute("data-aos-ready"),
      opacity: getComputedStyle(w).opacity,
      wordT: getComputedStyle(w).transitionDuration,
      btnT: b ? getComputedStyle(b).transitionDuration : "0s",
    };
  });
  ok(!r.ready && r.opacity === "1", `${label}: words are visible at once and data-aos-ready is not armed ${JSON.stringify(r)}`);
  ok(/^0s(, 0s)*$/.test(r.wordT) && /^0s(, 0s)*$/.test(r.btnT), `${label}: nothing transitions (${r.wordT} / ${r.btnT})`);
  await page.context().close();
}

try {
  await signInAsStaff(admin);
  if (process.env.RESTORE) {
    await save(admin, DEFAULTS);
    console.log("restored to the shipped defaults");
    await browser.close();
    process.exit(0);
  }
  const before = await publicSettings();
  for (const k of KEYS) original[k] = before[k] ?? "";
  console.log("original:", JSON.stringify(original));

  // Warm each theme one by one: a cold dev server compiles on first request.
  for (const t of THEMES) {
    const t0 = Date.now();
    await admin.goto(`${BASE}/theme-preview/${t}`, { waitUntil: "load", timeout: 600000 }).catch((e) => console.log(`warm ${t}: ${e.message}`.slice(0, 160)));
    console.log(`warm ${t}: ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  await save(admin, { motion_feel: "fluid", motion_text: "wave", motion_buttons: "spring", motion_cards: "spring", motion_micro: "fluid" });
  for (const t of THEMES) for (const w of [1280, 390]) await run(t, w, "spring");
  await reduced("classic");
  await themeHeading("classic", 1280);

  await save(admin, { motion_buttons: "magnetic" });
  for (const t of THEMES) for (const w of [1280, 390]) await run(t, w, "magnetic");
} catch (e) {
  failed++;
  console.log("ERROR", e.message);
} finally {
  try {
    await save(admin, Object.fromEntries(KEYS.map((k) => [k, original[k] || DEFAULTS[k]])));
    console.log("restored:", JSON.stringify(await publicSettings().then((s) => Object.fromEntries(KEYS.map((k) => [k, s[k]])))));
  } catch (e) { console.log("RESTORE FAILED - set the Motion tab back by hand:", JSON.stringify(original), e.message); failed++; }
  await browser.close();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
