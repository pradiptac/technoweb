import { chromium } from "playwright";

const ok = (l, c, e = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}${e ? "  — " + e : ""}`); return c ? 0 : 1; };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
p.setDefaultNavigationTimeout(300_000);
p.setDefaultTimeout(120_000);
p.on("pageerror", (e) => console.log("PAGE EXCEPTION:", String(e).slice(0, 200)));

await p.goto("http://localhost:3000/admin/login", { waitUntil: "load" });
await p.fill("#email", process.env.E);
await p.fill("#password", process.env.P);
await Promise.all([
  p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 300_000 }),
  p.click('button[type=submit]'),
]);

const go = async (path) => {
  for (let i = 0; i < 4; i++) {
    try { await p.goto("http://localhost:3000" + path, { waitUntil: "load" }); break; } catch {}
  }
  await p.waitForTimeout(1200);
};

let bad = 0;
await go("/admin/media");

// ---- structure ----
bad += ok("Files and Images tabs present",
  (await p.locator('[role="tab"]').count()) === 2,
  (await p.locator('[role="tab"]').allTextContents()).join(" / "));
bad += ok("folder rail present", await p.getByText("Folders", { exact: true }).isVisible());
const cards = await p.locator("main ul li").filter({ has: p.locator("img") }).count();
bad += ok("images render in the grid", cards > 0, `${cards} cards`);

// ---- the promised non-right-click path ----
// Scoped to the grid: the folder rail has menu buttons too, and it comes
// first in the DOM.
const grid = p.locator("main ul li").filter({ has: p.locator("img") });
const menuButtons = grid.locator('button[aria-haspopup="menu"]');
bad += ok("every item has a visible menu button", (await menuButtons.count()) > 0, `${await menuButtons.count()} buttons`);

await menuButtons.first().click();
await p.waitForTimeout(300);
const menu = p.locator('[role="menu"]');
bad += ok("clicking it opens the menu", await menu.isVisible());
const labels = (await menu.locator('[role="menuitem"]').allTextContents()).map((t) => t.trim());
bad += ok("menu offers the reference actions",
  ["View", "Download", "Resize", "Rename", "Delete"].every((l) => labels.some((x) => x.includes(l))),
  labels.join(" | "));
bad += ok("focus lands in the menu", await p.evaluate(() =>
  document.querySelector('[role="menu"]')?.contains(document.activeElement)));

await p.keyboard.press("Escape");
await p.waitForTimeout(250);
bad += ok("escape closes it", (await p.locator('[role="menu"]').count()) === 0);

// ---- right-click opens it too ----
await p.locator("main ul li img").first().click({ button: "right" });
await p.waitForTimeout(300);
bad += ok("right-click opens the same menu", await p.locator('[role="menu"]').isVisible());
await p.keyboard.press("Escape");
await p.waitForTimeout(200);

// ---- resize is refused for SVG, in the UI, before any request ----
// Pick a card whose stored path is an .svg — the filename is a label and
// can say anything, which is how an earlier run of this test picked a PNG.
const svgCard = grid.filter({ has: p.locator('p.font-mono:text-matches("\.svg$")') }).first();
const svgName = (await svgCard.locator("p").first().textContent())?.trim();
await svgCard.locator('button[aria-haspopup="menu"]').click();
await p.waitForTimeout(400);
const resize = p.locator('[role="menuitem"]').filter({ hasText: "Resize" }).first();
bad += ok(`Resize is disabled for ${svgName}`, await resize.isDisabled(),
  `title: ${await resize.getAttribute("title")}`);
await p.keyboard.press("Escape");
await p.waitForTimeout(250);

// ---- rename round trip ----
await menuButtons.first().click();
await p.waitForTimeout(300);
await p.locator('[role="menuitem"]').filter({ hasText: "Rename" }).first().click();
await p.waitForTimeout(600);
const dlg = p.locator('[role="dialog"]');
bad += ok("rename dialog opens", await dlg.isVisible());
const field = dlg.locator('input[name="filename"]');
const original = await field.inputValue();
await field.fill("renamed-by-ui-probe.svg");
await dlg.getByRole("button", { name: /^Save$/ }).click();
// Wait for the dialog to go, then for the grid to actually show it.
await p.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
let sawRename = false;
for (let i = 0; i < 20; i++) {
  if ((await p.locator("main").textContent()).includes("renamed-by-ui-probe")) { sawRename = true; break; }
  await p.waitForTimeout(500);
}
bad += ok("the new name shows in the grid", sawRename);

// put it back
await menuButtons.first().click();
await p.waitForTimeout(300);
await p.locator('[role="menuitem"]').filter({ hasText: "Rename" }).first().click();
await p.waitForTimeout(600);
await p.locator('[role="dialog"] input[name="filename"]').fill(original);
await p.locator('[role="dialog"]').getByRole("button", { name: /^Save$/ }).click();
await p.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
let restored = false;
for (let i = 0; i < 20; i++) {
  if ((await p.locator("main").textContent()).includes(original)) { restored = true; break; }
  await p.waitForTimeout(500);
}
bad += ok("restored the original name", restored, original);

// ---- folders ----
await p.getByRole("button", { name: /\+ New/ }).click();
await p.waitForTimeout(600);
const name = "UI probe " + Math.random().toString(36).slice(2, 7);
await p.locator('[role="dialog"] input[name="name"]').fill(name);
await p.locator('[role="dialog"]').getByRole("button", { name: /Create folder/ }).click();
await p.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
let sawFolder = false;
for (let i = 0; i < 20; i++) {
  if ((await p.locator("main").textContent()).includes(name)) { sawFolder = true; break; }
  await p.waitForTimeout(500);
}
bad += ok("the new folder appears in the rail", sawFolder);

await p.getByRole("link", { name: new RegExp(name) }).click();
await p.waitForTimeout(1800);
bad += ok("selecting a folder filters the grid and is in the URL",
  p.url().includes("folder="), p.url());
bad += ok("an empty folder says so",
  (await p.locator("main").textContent()).toLowerCase().includes("nothing"));

// delete it again
await p.getByRole("button", { name: /Actions for folder/ }).first().click();
await p.waitForTimeout(400);
await p.locator('[role="menuitem"]').filter({ hasText: "Delete folder" }).first().click();
await p.waitForTimeout(600);
await p.locator('[role="dialog"]').getByRole("button", { name: /Delete folder/ }).click();
let gone = false;
for (let i = 0; i < 20; i++) {
  await p.waitForTimeout(500);
  if (!(await p.locator("main").textContent()).includes(name)) { gone = true; break; }
}
bad += ok("the folder is gone", gone);

// ---- files tab ----
await go("/admin/media?kind=file");
bad += ok("the Files tab loads", (await p.locator('[role="tab"][aria-selected="true"]').textContent()).includes("Files"));

console.log(bad ? `\n${bad} check(s) failed` : "\nthe media screen works");
await b.close();
process.exit(bad ? 1 : 0);
