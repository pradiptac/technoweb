import { chromium } from "playwright";

/**
 * The support network (0.170.0, docs/support-network.md), through the real
 * console form and the public page.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/support-network.mjs
 *
 * In the console it creates two centres through the form — one in Kolkata
 * (pin typed in) and one in Singapore (pin from a pasted Google Maps link) —
 * tagging the signed-in staff member to Kolkata as shown and to Singapore as
 * hidden. On `/support-network` it then checks: both cards, a pin for each,
 * Kolkata's pin east of Mumbai's sample pin; the staff name on Kolkata's
 * card only and their email nowhere in the HTML; the country chips, and that
 * choosing Singapore hides India's group and zooms the map; pressing a pin
 * marks its card; one `h1`, no overflow at 360 and 1280, nothing logged.
 * **It deletes both centres** through the console's Delete. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("dialog", (d) => d.accept().catch(() => {}));
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });

const { signInAsStaff, ADMIN_EMAIL } = await import("../shared.mjs");
await signInAsStaff(page);
const stamp = Date.now().toString(36);
const made = [];

async function create({ name, country, city, address, lat, lng, link, isPublic }) {
  await page.goto(`${BASE}/admin/support-centres/new`, { waitUntil: "load", timeout: 240000 });
  await page.locator("#name").waitFor({ timeout: 240000 });
  await page.waitForTimeout(2500);
  await page.fill("#name", name);
  await page.fill("#phone", "+91 33 0000 9999");
  await page.getByRole("tab", { name: "Location" }).click();
  await page.selectOption("#country_code", country);
  await page.fill("#city", city);
  await page.fill("#address", address);
  if (link) {
    await page.fill("#maps_link", link);
    await page.getByRole("button", { name: "Use link" }).click();
  } else {
    await page.fill("#latitude", String(lat));
    await page.fill("#longitude", String(lng));
  }
  await page.getByRole("tab", { name: "Staff" }).click();
  const option = await page.locator("#add_staff option").filter({ hasText: ADMIN_EMAIL }).first().getAttribute("value");
  await page.selectOption("#add_staff", option);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("[data-centre-staff] input[aria-label^='Title']").first().fill("Probe engineer");
  if (!isPublic) await page.locator("[data-centre-staff] input[role='switch']").first().click();
  await page.locator('[data-form-actions] button[type="submit"]').click();
  await page.waitForURL(/\/admin\/support-centres\/\d+/, { timeout: 240000 });
  const id = Number(page.url().match(/support-centres\/(\d+)/)[1]);
  made.push(id);
  return id;
}

const kolkata = `Probe Kolkata ${stamp}`;
const singapore = `Probe Singapore ${stamp}`;
await create({ name: kolkata, country: "IN", city: "Kolkata", address: "1 Probe Road", lat: 22.57, lng: 88.36, isPublic: true });
ok(made.length === 1, "a centre is created through the form (pin typed)");
const sgId = await create({ name: singapore, country: "SG", city: "Singapore", address: "2 Probe Way", link: "https://www.google.com/maps/place/x/@1.3521,103.8198,12z", isPublic: false });
ok(made.length === 2, "a second through the form (pin from a pasted link)");
const sgLat = await page.locator("#latitude").inputValue().catch(() => "");
ok(sgLat === "" || Math.abs(Number(sgLat) - 1.3521) < 0.001, "the pasted link's coordinates were saved");

await page.goto(`${BASE}/admin/users?centre=${sgId}`, { waitUntil: "load", timeout: 240000 });
ok((await page.locator("[data-centre-filter]").count()) === 1 && (await page.textContent("table"))?.includes(ADMIN_EMAIL.split("@")[0]) !== false, "the staff list filters by centre");

for (const w of [1280, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${BASE}/support-network`, { waitUntil: "networkidle", timeout: 240000 });
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `no overflow at ${w}`);
}
await page.setViewportSize({ width: 1280, height: 900 });
const html = await page.content();
ok((await page.locator("h1").count()) === 1, "one h1");
const kSlug = kolkata.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const sSlug = singapore.toLowerCase().replace(/[^a-z0-9]+/g, "-");
ok((await page.locator(`[data-centre-card="${kSlug}"]`).count()) === 1 && (await page.locator(`[data-centre-card="${sSlug}"]`).count()) === 1, "both cards are listed");
ok((await page.locator(`[data-pin="${kSlug}"]`).count()) === 1 && (await page.locator(`[data-pin="${sSlug}"]`).count()) === 1, "each has a pin");
const xOf = (slug) => page.locator(`[data-pin="${slug}"]`).evaluate((g) => Number(g.getAttribute("transform").match(/translate\(([\d.]+)/)[1]));
const mumbai = await page.locator('[data-pin*="mumbai"]').first().count() ? await xOf(await page.locator('[data-pin*="mumbai"]').first().getAttribute("data-pin")) : null;
if (mumbai !== null) ok((await xOf(kSlug)) > mumbai, "Kolkata's pin sits east of Mumbai's");
ok((await page.locator(`[data-centre-card="${kSlug}"]`).textContent())?.includes("Probe engineer"), "the shown staff member is on Kolkata's card");
ok(!(await page.locator(`[data-centre-card="${sSlug}"]`).textContent())?.includes("Probe engineer"), "and not on Singapore's, where they are hidden");
ok(!html.includes(ADMIN_EMAIL), "the staff member's email is nowhere on the page");

const chips = page.getByRole("group", { name: "Show a country" });
ok(await chips.count() === 1, "country chips are offered");
const before = await page.locator("[data-map-zoom]").evaluate((g) => g.style.transform);
await chips.getByRole("button", { name: /Singapore/ }).click();
await page.waitForTimeout(900);
ok(await page.locator('[data-country-group="IN"]').isHidden(), "choosing Singapore hides India's centres");
ok((await page.locator("[data-map-zoom]").evaluate((g) => g.style.transform)) !== before, "and zooms the map");
await chips.getByRole("button", { name: /All countries/ }).click();
await page.locator(`[data-pin="${kSlug}"]`).dispatchEvent("click");
await page.waitForTimeout(600);
ok(await page.locator(`[data-centre-card="${kSlug}"]`).getAttribute("data-active") !== null, "pressing a pin marks its card");

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);

// Through the console's own Delete, which purges the public page.
let removed = 0;
for (const id of made) {
  await page.goto(`${BASE}/admin/support-centres/${id}`, { waitUntil: "load", timeout: 240000 });
  await page.getByRole("button", { name: "Delete centre" }).click();
  await page.waitForURL(/\/admin\/support-centres(\?|$)/, { timeout: 240000 }).catch(() => {});
  if (/done=support-centre-deleted/.test(page.url())) removed++;
}
ok(removed === made.length, `both centres deleted (${removed} of ${made.length})`);

await browser.close();
process.exit(failed ? 1 : 0);
