/**
 * Search by meaning (0.182.0, docs/semantic-search.md): a phrase that shares no
 * words with a page still finds results, and an exact part number still puts its
 * product first.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/semantic-search.mjs
 *
 * Reads the status with the session token the sign-in leaves, and SKIPS (exit 0)
 * when there is nothing to prove: switched off, no OpenRouter key, or nothing
 * embedded yet. Never changes a setting and writes nothing. SKU / SKU_NAME
 * override the first shop product it finds; API_BASE_URL the API.
 */
import { chromium } from "playwright";

const { signInAsStaff, BASE } = await import("../shared.mjs");

const T = 120000;
const API = `${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/v1`;
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(T);
try {
  await signInAsStaff(page, { timeout: T });
  const cookie = (await context.cookies()).find((c) => c.name === "tw_admin_session");
  const headers = { Authorization: `Bearer ${decodeURIComponent(cookie?.value ?? "")}`, Accept: "application/json" };
  const get = async (path) => (await fetch(`${API}${path}`, { headers })).json();

  const status = (await get("/admin/search/semantic")).data;
  if (!status) throw new Error("could not read /admin/search/semantic");

  const key = Object.values((await get("/admin/settings")).data ?? {}).flat().find((r) => r.key === "openrouter_api_key");
  if (!status.enabled && !key?.is_set) {
    console.log("semantic search probe skipped: no OpenRouter key");
  } else if (!status.enabled) {
    console.log("semantic search probe skipped: switched off");
  } else if (status.passages.embedded === 0) {
    console.log("semantic search probe skipped: nothing is indexed yet");
  } else {
    // 1. A phrase with none of the page's words still finds something.
    await page.goto(`${BASE}/search?q=${encodeURIComponent("network keeps dropping")}`, { waitUntil: "load", timeout: T });
    const hits = await page.locator("main section ul li a").count();
    if (hits < 1) fail("'network keeps dropping' found nothing");

    // 2. An exact part number is still first in its group.
    // A published one: a draft's SKU is not on the public search, so it would fail for the wrong reason.
    const products = (await get("/admin/store/products?status=published&per_page=100")).data ?? [];
    const product = process.env.SKU ? { sku: process.env.SKU, name: process.env.SKU_NAME ?? process.env.SKU } : products.find((p) => p.sku && p.status === "published");
    if (!product) fail("the shop has no published product with a SKU to search for");
    else {
      await page.goto(`${BASE}/search?q=${encodeURIComponent(product.sku)}`, { waitUntil: "load", timeout: T });
      const first = page.locator("main section").filter({ has: page.locator("h2", { hasText: /in the shop/i }) }).first().locator("ul li a").first();
      const text = (await first.textContent().catch(() => "")) ?? "";
      if (!text.includes(product.name)) fail(`'${product.sku}' did not put "${product.name}" first (got "${text.slice(0, 60)}")`);
    }
    console.log(process.exitCode ? "semantic search probe FAILED" : "semantic search probe passed");
  }
} catch (e) {
  fail(String(e?.message ?? e).split("\n")[0]);
} finally {
  await browser.close();
}
