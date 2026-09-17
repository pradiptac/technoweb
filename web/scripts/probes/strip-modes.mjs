/**
 * The logo strips' thirteen modes, measured per theme.
 *
 * Opens every theme's preview homepage, finds the two `[data-strip-mode]`
 * strips, and for each: reads the mode, samples the moving element twice
 * 400ms apart so "animated" is a measured claim (a track's transform, a
 * lens logo's translate, the ring's rotation, a grid item's opacity after
 * the reveal), checks the document has not widened, and screenshots the
 * strip into the scratch directory for the eye. Prints one row per strip
 * and exits non-zero if any theme repeats another's partners mode or
 * Trusted-by mode, if a moving mode did not move, or if a page overflows.
 *
 * `/theme-preview/<id>` is behind the staff login, so it signs in once
 * with ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD (a content manager is
 * enough) and opens every theme from that context. It prints nothing and
 * exits 2 without them — a run that found no strips is not a pass.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/strip-modes.mjs
 *   OUT=/tmp/strips …                              # BASE defaults to :3000
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "scripts/_strips";
const THEMES = ["classic", "editorial", "datacenter", "launch", "terminal", "enterprise", "summit", "horizon", "canvas"];
const MOVING = new Set(["marquee", "drift", "bob", "spotlight", "parallax", "lens", "cascade", "ring", "pulse"]);
const { ADMIN_LOGIN_EMAIL: EMAIL, ADMIN_LOGIN_PASSWORD: PASSWORD } = process.env;
if (!EMAIL || !PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 120000 });
const toPassword = page.locator('button:has-text("Use your password instead")');
if (await toPassword.count()) { await toPassword.first().click(); await page.waitForSelector("#password"); }
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 120000 }),
  page.click('button[type="submit"]'),
]);
let failed = false;
const seen = { partners: new Map(), clients: new Map() };

const sample = () => page.evaluate(() => {
  return [...document.querySelectorAll("[data-strip-mode]")].map((root) => {
    const mode = root.querySelector(".flip-tile") ? "flip" : root.dataset.stripMode;
    const kind = /trusted by/i.test(root.querySelector("p")?.textContent ?? "") ? "clients" : "partners";
    const pick = () => {
      if (mode === "flip") return root.querySelector(".brand-marquee-track");
      if (mode === "lens") return root.querySelector(".strip-lens > li");
      if (mode === "ring") return root.querySelector(".strip-ring");
      if (mode === "cascade") return root.querySelector(".brand-marquee-track-y");
      if (mode === "parallax") return root.querySelector(".strip-back");
      if (["rise", "wipe", "flicker", "deal", "pulse"].includes(mode)) return root.querySelector(".strip-grid > li:nth-child(2)");
      if (mode === "bob") return root.querySelector(".brand-marquee-track > li");
      if (mode === "spotlight") return root.querySelector(".brand-marquee");
      return root.querySelector(".brand-marquee-track");
    };
    const el = pick();
    const cs = el && getComputedStyle(el, mode === "spotlight" ? "::after" : null);
    const r = root.getBoundingClientRect();
    const running = !!el && [el, ...el.querySelectorAll("*")].some((n) => n.getAnimations().some((a) => a.playState === "running"));
    return {
      mode,
      kind,
      running,
      top: r.top + scrollY,
      height: r.height,
      value: cs ? [cs.transform, cs.translate, cs.rotate, cs.scale, cs.opacity, cs.boxShadow].join("|") : "missing",
      animated: !!root.querySelector("[data-aos-animate]") || root.hasAttribute("data-aos-animate"),
    };
  });
});

for (const theme of THEMES) {
  await page.goto(`${BASE}/theme-preview/${theme}`, { waitUntil: "networkidle" });
  // Scroll both strips into view so the reveal observer stamps them.
  const first = await sample();
  for (const s of first) {
    await page.evaluate((y) => scrollTo(0, y - 200), s.top);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(900);
  const a = await sample();
  await page.waitForTimeout(400);
  const b = await sample();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  for (let i = 0; i < a.length; i++) {
    const { mode, kind } = a[i];
    const moved = a[i].value !== b[i].value || b[i].running;
    const grid = !MOVING.has(mode);
    // A grid has finished its entrance by now: the item must be visible.
    const settled = grid ? b[i].value.split("|")[4] === "1" : true;
    const ok = (grid ? settled : moved) && a[i].value !== "missing";
    const dup = seen[kind].get(mode);
    if (dup) failed = true;
    if (!ok || overflow > 0) failed = true;
    seen[kind].set(mode, theme);
    console.log(
      `${theme.padEnd(11)} ${kind.padEnd(9)} ${mode.padEnd(10)} ${ok ? "ok " : "BAD"}  ${grid ? "opacity " + b[i].value.split("|")[4] : moved ? "moving" : "STILL"}` +
      `  overflow ${overflow}px${dup ? `  DUPLICATE of ${dup}` : ""}`,
    );
    await page.evaluate((y) => scrollTo(0, y - 40), a[i].top);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${theme}-${kind}-${mode}.png`, clip: { x: 0, y: 40, width: 1440, height: Math.min(a[i].height + 20, 420) } });
  }
}

await browser.close();
if (seen.partners.size === 0) { console.error("No strips found on any theme — is the login right?"); process.exit(2); }
console.log(failed ? "\nFAILED" : "\nall strips distinct and moving");
process.exit(failed ? 1 : 0);
