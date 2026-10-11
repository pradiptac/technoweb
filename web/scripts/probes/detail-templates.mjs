import { chromium } from "playwright";

/**
 * Detail-page templates (0.161.0, docs/page-builder.md "Detail templates"),
 * driven through the real screens and read on the real page.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/detail-templates.mjs
 *   SERVICE_SLUG=web-hosting   a published service to read the page of (the mock's)
 *   KEEP=1                     leaves the throwaway template behind (its address is printed)
 *
 * **It creates one template for services and deletes it again, switched off
 * first, in a `finally`.** On the real screens it: starts a template for
 * services from "Today's layout" (the six parts of a service's page), moves
 * the enquiry form from the end to the very top (five presses of its up
 * arrow), adds a Text section with a heading and a typed body, saves, and
 * switches it on. Then on the public service page it checks: exactly one `h1`;
 * the enquiry card ("Ask about …") now above the `h1`, where the page without
 * a template has it after; the Text section's heading is there; no horizontal
 * overflow at 360 and 1280; nothing logged to the console. Switched off, the
 * page is back to its own order (the enquiry below the heading). Then it
 * deletes the template.
 *
 * Not run by the author of the release — written against the markup — so a
 * locator that has drifted fails here first. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
process.env.BASE = BASE; // shared.mjs reads it at import
const SLUG = process.env.SERVICE_SLUG ?? "web-hosting";
const T = 180000;
const stamp = Date.now().toString(36);
const NAME = `Probe service layout ${stamp}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const problems = [];
const listen = (p, where) => {
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${where} ${m.type()}: ${m.text().slice(0, 300)}`); });
  p.on("pageerror", (e) => problems.push(`${where} pageerror: ${e.message.slice(0, 300)}`));
};
listen(page, "console");

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);

let id = null;
const cards = page.locator("li[data-section-card]");
const order = () => cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-section-card")));
const saveButton = () => page.getByRole("button", { name: "Save", exact: true });

/** Where the enquiry card and the h1 sit on the public page, and what else it holds. */
const readPublic = async (width) => {
  const reader = await ctx.newPage();
  listen(reader, `public@${width}`);
  await reader.setViewportSize({ width, height: 900 });
  await reader.goto(`${BASE}/services/${SLUG}`, { waitUntil: "load", timeout: T });
  await reader.waitForTimeout(1500);
  const info = await reader.evaluate(() => {
    const top = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : null);
    const h1s = [...document.querySelectorAll("h1")];
    const enquiry = [...document.querySelectorAll("h2")].find((h) => /^Ask about/.test(h.textContent ?? ""));
    const text = [...document.querySelectorAll("h2")].find((h) => (h.textContent ?? "").includes("Probe text heading"));
    return {
      h1: h1s.length,
      h1Top: top(h1s[0]),
      enquiryTop: top(enquiry),
      textTop: top(text),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  await reader.close();
  return info;
};

try {
  // ---- start from today's layout ---------------------------------------------
  await page.goto(`${BASE}/admin/detail-templates/new?type=service`, { waitUntil: "load", timeout: T });
  const form = page.locator("form").filter({ has: page.locator("#name") });
  await form.locator("#name").waitFor({ timeout: T });
  await page.waitForTimeout(1500);
  await form.locator("#name").fill(NAME);
  ok((await form.locator('input[name="start"][value="today"]').isChecked()), "“Today’s layout” is the way a template starts");
  await Promise.all([
    page.waitForURL(/\/admin\/detail-templates\/\d+$/, { timeout: T }),
    form.getByRole("button", { name: "Create template" }).click(),
  ]);
  id = Number(new URL(page.url()).pathname.split("/").pop());
  await cards.first().waitFor({ timeout: T });
  await page.waitForTimeout(1500);

  const today = await order();
  ok(JSON.stringify(today) === JSON.stringify(["record_hero", "record_body", "record_custom_fields", "record_answer_blocks", "record_related", "record_enquiry"]),
    `a service template starts as the page draws it today (${today.join(", ")})`);

  // ---- move the enquiry form to the very top ---------------------------------
  for (let n = today.length; n > 1; n--) {
    await page.getByRole("button", { name: `Move section ${n} up`, exact: true }).click();
  }
  const moved = await order();
  ok(moved[0] === "record_enquiry" && moved[1] === "record_hero", `the enquiry form is moved above the heading (${moved.join(", ")})`);

  // ---- a record block is placed once, and has no style or background ----------
  await page.getByRole("button", { name: "Add a section" }).first().click();
  const dialog = page.locator("dialog[open]");
  ok(await dialog.locator('button[data-record-block="record_enquiry"]').count() === 0, "a part already placed is not offered again");
  ok(await dialog.locator('button[data-record-block="record_buy"]').count() === 0, "a part this kind of page has no use for is never offered");

  // ---- add a Text section ----------------------------------------------------
  await dialog.locator("button", { hasText: "A heading and a body from the editor" }).first().click();
  const text = page.locator('li[data-section-card="rich_text"]').first();
  await text.waitFor({ timeout: 30000 });
  if ((await text.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await text.locator("button[aria-expanded]").first().click();
  await text.getByLabel("Heading", { exact: true }).first().fill("Probe text heading");
  const editable = text.locator(".note-editable");
  await editable.waitFor({ timeout: 60000 });
  await editable.click();
  await page.keyboard.type("Probe paragraph typed into the editor.");
  await page.waitForTimeout(500);

  // ---- save, then switch on ---------------------------------------------------
  await saveButton().click();
  await page.getByText("Saved.", { exact: false }).first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "load", timeout: T });
  await cards.first().waitFor({ timeout: T });
  ok((await order())[0] === "record_enquiry", "the order survives a save and a reload");

  const switchOn = page.getByRole("button", { name: "Switch on", exact: true });
  await switchOn.waitFor({ timeout: 60000 });
  await switchOn.click();
  await page.getByRole("button", { name: "Switch off", exact: true }).waitFor({ timeout: 60000 });
  ok(true, "Switch on turns it on");

  // ---- the public page --------------------------------------------------------
  for (const width of [1280, 360]) {
    const on = await readPublic(width);
    ok(on.h1 === 1, `@${width}: exactly one h1 (${on.h1})`);
    ok(on.enquiryTop !== null && on.h1Top !== null && on.enquiryTop < on.h1Top, `@${width}: the enquiry card is above the heading (${on.enquiryTop} < ${on.h1Top})`);
    ok(on.textTop !== null, `@${width}: the Text section is on the page`);
    ok(on.overflow <= 0, `@${width}: no horizontal overflow (${on.overflow}px)`);
  }

  // ---- switch off: the page is its own again -----------------------------------
  await page.getByRole("button", { name: "Switch off", exact: true }).click();
  await page.getByRole("button", { name: "Switch on", exact: true }).waitFor({ timeout: 60000 });
  const off = await readPublic(1280);
  ok(off.h1 === 1 && off.textTop === null, "switched off, the page has no Text section and one h1");
  ok(off.enquiryTop === null || off.enquiryTop > off.h1Top, "switched off, the enquiry form is below the heading again");

  ok(problems.length === 0, `no console errors${problems.length ? ": " + problems.join(" | ") : ""}`);
} finally {
  if (id && !process.env.KEEP) {
    try {
      await page.goto(`${BASE}/admin/detail-templates/${id}`, { waitUntil: "load", timeout: T });
      const off = page.getByRole("button", { name: "Switch off", exact: true });
      if (await off.count()) { await off.click(); await page.getByRole("button", { name: "Switch on", exact: true }).waitFor({ timeout: 60000 }); }
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Delete template", exact: true }).click();
      await page.waitForURL(/\/admin\/detail-templates$/, { timeout: 60000 });
      console.log("deleted the throwaway template");
    } catch (e) {
      console.log(`could not delete template ${id}: ${e.message.split("\n")[0]}`);
    }
  } else if (id) {
    console.log(`kept: ${BASE}/admin/detail-templates/${id}`);
  }
  await browser.close();
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
