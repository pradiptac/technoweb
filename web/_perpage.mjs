import { chromium } from "playwright";

const ok = (l, c, e = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${l}${e ? "  — " + e : ""}`); return c ? 0 : 1; };

const ROUTES = [
  "/admin/tickets", "/admin/blog", "/admin/knowledge-base", "/admin/case-studies",
  "/admin/pages", "/admin/faqs", "/admin/media", "/admin/products",
  "/admin/product-categories", "/admin/brands", "/admin/solutions", "/admin/services",
  "/admin/industries", "/admin/seo", "/admin/redirects", "/admin/users",
];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
p.setDefaultNavigationTimeout(300_000);
p.setDefaultTimeout(120_000);
await p.goto("http://localhost:3000/admin/login", { waitUntil: "load" });
await p.fill("#email", process.env.E);
await p.fill("#password", process.env.P);
await Promise.all([
  p.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 300_000 }),
  p.click('button[type=submit]'),
]);

const go = async (u) => {
  for (let i = 0; i < 4; i++) {
    try { await p.goto("http://localhost:3000" + u, { waitUntil: "load" }); break; } catch {}
  }
  await p.waitForTimeout(700);
};

let bad = 0;

// --- the control is on every list screen ---
console.log("--- present on every list ---");
for (const route of ROUTES) {
  await go(route);
  const r = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("main button")].find((x) => /per page/.test(x.textContent || ""));
    const nav = document.querySelector('nav[aria-label="Pagination"]');
    return {
      control: btn?.textContent?.trim() ?? null,
      showing: nav?.textContent?.match(/Showing\s+[\d–-]+\s+of\s+\d+|No records/)?.[0] ?? null,
    };
  });
  const good = Boolean(r.control) && Boolean(r.showing);
  if (!good) bad++;
  console.log(`${good ? "ok  " : "FAIL"}  ${route.padEnd(28)} ${String(r.control).padEnd(14)} ${r.showing}`);
}

// --- choosing a size actually changes the list ---
console.log("\n--- choosing a size ---");
await go("/admin/seo");
const before = await p.evaluate(() => document.querySelectorAll("main tbody tr").length);
await p.locator("main button").filter({ hasText: /per page/ }).click();
await p.waitForTimeout(400);
bad += ok("the menu opens", await p.locator('[role="menu"]').isVisible());
const items = await p.locator('[role="menuitemradio"]').allTextContents();
bad += ok("offers 10/25/50/100", items.join(",").replace(/ per page/g, "") === "10,25,50,100", items.join(" | "));
bad += ok("marks the current size", await p.locator('[role="menuitemradio"][aria-checked="true"]').count() === 1);

await p.locator('[role="menuitemradio"]').filter({ hasText: "10 per page" }).click();
await p.waitForURL(/per_page=10/, { timeout: 60000 });
await p.waitForTimeout(1500);
const after = await p.evaluate(() => document.querySelectorAll("main tbody tr").length);
bad += ok("the list resizes", after === 10 && before !== 10, `${before} rows -> ${after}`);
bad += ok("and the size is in the URL", p.url().includes("per_page=10"), p.url());

const showing = await p.evaluate(() =>
  document.querySelector('nav[aria-label="Pagination"]')?.textContent ?? "");
bad += ok("the range reads 1–10", /Showing\s*1–10\s*of/.test(showing.replace(/\s+/g, " ")), showing.replace(/\s+/g, " ").slice(0, 40));

// --- next page keeps the size ---
await p.getByRole("link", { name: "Next page" }).click();
await p.waitForTimeout(1500);
bad += ok("paging keeps the chosen size", p.url().includes("per_page=10") && p.url().includes("page=2"), p.url());
const page2 = await p.evaluate(() =>
  document.querySelector('nav[aria-label="Pagination"]')?.textContent ?? "");
bad += ok("and the range advances", /11–20/.test(page2.replace(/\s+/g, " ")), page2.replace(/\s+/g, " ").slice(0, 40));

// --- resizing resets to page 1 ---
await p.locator("main button").filter({ hasText: /per page/ }).click();
await p.waitForTimeout(400);
await p.locator('[role="menuitemradio"]').filter({ hasText: "50 per page" }).click();
await p.waitForTimeout(1800);
bad += ok("resizing returns to the first page", !p.url().includes("page=2"), p.url());

// --- a filter survives a resize ---
await go("/admin/seo?q=switch");
await p.locator("main button").filter({ hasText: /per page/ }).click();
await p.waitForTimeout(400);
await p.locator('[role="menuitemradio"]').filter({ hasText: "25 per page" }).click();
await p.waitForTimeout(1800);
bad += ok("the filter survives a resize", p.url().includes("q=switch") && p.url().includes("per_page=25"), p.url());

console.log(bad ? `\n${bad} check(s) failed` : "\nper-page works on every list");
await b.close();
process.exit(bad ? 1 : 0);
