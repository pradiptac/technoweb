import { chromium } from "playwright";

/**
 * Measures the heading scale (`theme_type_scale`) and the two card finishes
 * added in 0.121.0 (`theme_surface` soft and glow), end to end through the
 * real Site settings form.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/look-finish.mjs
 *   HOLD="glow large" leaves that pair saved (for an audit run or a
 *   screenshot); RESTORE=1 only puts Flat + Standard back.
 *
 * Checks: (1) untouched, the site stamps neither attribute and a section
 * heading is the size it always was (42px at 1440, 27px at 360); (2) Large
 * reaches the site as `data-type-scale` and multiplies that heading by 1.16
 * from `md` and by 1.06 on a phone; Compact by 0.88; (3) Glow and Soft reach
 * it as `data-surface`, give a card a shadow that is not the flat one, and
 * leave its border *width* alone, so no box changes size; Soft's border is
 * transparent; (4) nothing scrolls sideways at 360 or 1440 in the largest
 * setting, on the home page, an index page and the shop; (5) put back,
 * neither attribute remains and the heading is its first size again.
 * Carries no credential; saves the appearance tab — a development database
 * only.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");
const admin = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await signInAsStaff(admin);

async function save(surface, scale) {
  await admin.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 180000 });
  await admin.waitForSelector("#setting__theme_surface", { timeout: 60000 });
  await admin.selectOption("#setting__theme_surface", surface);
  await admin.selectOption("#setting__theme_type_scale", scale);
  await admin.getByRole("button", { name: /Save site settings/ }).click();
  await admin.waitForTimeout(5000);
}

if (process.env.RESTORE === "1") {
  await save("flat", "standard");
  await browser.close();
  console.log("restored");
  process.exit(0);
}

const site = async (width) => {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(1500);
  const read = await page.evaluate(() => {
    const root = document.querySelector(".public-site");
    const h2 = root.querySelector("h2.display-2");
    const card = root.querySelector("[data-tile], [data-card]");
    const cs = card ? getComputedStyle(card) : null;
    return {
      surface: root.getAttribute("data-surface"), scale: root.getAttribute("data-type-scale"),
      h2: h2 ? parseFloat(getComputedStyle(h2).fontSize) : null,
      shadow: cs?.boxShadow ?? null, border: cs?.borderTopWidth ?? null, borderColour: cs?.borderTopColor ?? null,
      over: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  await page.context().close();
  return read;
};
const near = (a, b) => Math.abs(a - b) < 0.2;

await save("flat", "standard");
const wide0 = await site(1440);
const phone0 = await site(360);
ok(wide0.surface === null && wide0.scale === null, "untouched, neither attribute is stamped");
ok(near(wide0.h2, 42) && near(phone0.h2, 27), `a section heading is the size it always was (${wide0.h2}px at 1440, ${phone0.h2}px at 360)`);

await save("glow", "large");
const wide1 = await site(1440);
const phone1 = await site(360);
ok(wide1.surface === "glow" && wide1.scale === "large", "Glow and Large reach the site");
ok(near(wide1.h2, 42 * 1.16), `Large is 1.16× from md (${wide1.h2}px)`);
ok(near(phone1.h2, 27 * 1.06), `and 1.06× on a phone (${phone1.h2}px)`);
ok(wide1.shadow !== "none" && wide1.shadow !== wide0.shadow, "a card under Glow has a shadow that is not the flat one");
ok(wide1.border === wide0.border, `its border is the same width, so no box changes size (${wide1.border})`);
ok(wide1.over <= 0 && phone1.over <= 0, `home: no sideways scroll at 1440 or 360 (${wide1.over}, ${phone1.over})`);

for (const path of ["/solutions", "/store", "/blog", "/contact"]) {
  for (const width of [360, 1440]) {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 });
    await page.waitForTimeout(1200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 0, `${path} at ${width}: no sideways scroll under Large (${over})`);
    await page.context().close();
  }
}

if (process.env.HOLD) {
  const [surface, scale] = process.env.HOLD.split(" ");
  await save(surface, scale);
  await browser.close();
  console.log(failed ? `\n${failed} failed (held ${process.env.HOLD})` : `\nall passed (held ${process.env.HOLD})`);
  process.exit(failed ? 1 : 0);
}

await save("soft", "compact");
const wide2 = await site(1440);
ok(wide2.surface === "soft" && near(wide2.h2, 42 * 0.88), `Soft and Compact reach the site (${wide2.h2}px)`);
ok(/, 0\)|\/ 0\)|transparent/.test(wide2.borderColour), `Soft's border is transparent (${wide2.borderColour})`);
ok(wide2.shadow !== "none" && wide2.border === wide0.border, "and it has a shadow and the same border width");

await save("flat", "standard");
const wide3 = await site(1440);
ok(wide3.surface === null && wide3.scale === null && near(wide3.h2, wide0.h2) && wide3.shadow === wide0.shadow, "put back, nothing remains of either setting");

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
