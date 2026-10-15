/**
 * The banded pricing layout (0.180.0, docs/blocks.md "Banded tiers").
 *
 * Makes a published banded pricing block (₹10 a month / ₹96 a year, a
 * "Custom" plan whose button is an email with the copy switch on, a promo
 * chip and a trust strip) and a published builder page holding it, through
 * the API as a throwaway administrator. Then, under the Terminal and Classic
 * theme previews (`/theme-preview/<theme>/page/<slug>`):
 *
 *   - the monthly period shows ₹10 and no saving;
 *   - Yearly shows ₹10 struck through, ₹8 /mo, "₹96 billed yearly · save ₹24"
 *     and "20% off";
 *   - the promo chip and the trust strip are drawn;
 *   - the copy button copies the address (clipboard read back);
 *   - a screenshot per theme at 1280 and 360 into the scratchpad given as
 *     SHOTS (skipped without it).
 *
 * It deletes the page and the block afterwards — unless KEEP=1, which leaves
 * them for an audit and prints their addresses (delete them by hand after). No credential is in this
 * file — `ADMIN_LOGIN_EMAIL` and `ADMIN_LOGIN_PASSWORD` only, and they must
 * be a throwaway account. One probe at a time, never beside an audit.
 *
 *   cd web && ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/pricing-banded.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const API = process.env.API ?? "http://127.0.0.1:8000/api/v1";
const SHOTS = process.env.SHOTS;
process.env.BASE = BASE;
const { signInAsStaff } = await import("../shared.mjs");

let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok   " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** An API token. Signing in again retires the last one — so does the browser's own sign-in, hence a second call before the clean-up. */
const signIn = async () => {
  const login = await fetch(`${API}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_LOGIN_EMAIL, password: process.env.ADMIN_LOGIN_PASSWORD }),
  });
  const t = (await login.json()).token;
  if (!t) throw new Error(`sign-in refused (${login.status})`);
  return t;
};
let token = await signIn();
const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) };
};

const stamp = Date.now();
let blockId = null;
let pageId = null;
const browser = await chromium.launch();

try {
  const block = await api("POST", "/admin/blocks", {
    type: "pricing", layout: "banded", name: `Probe banded ${stamp}`, status: "published",
    content: {
      heading: "Choose your plan",
      promo: "20% off · ends soon",
      guarantees: ["Cancel anytime", "Secure checkout"],
      billing: { enabled: true, yearly_note: "2 months free" },
      sets: [{ label: "Plans", plans: [
        { name: "Basic", badge: "Plan", description: "For getting started", price_monthly_paise: 1000, price_yearly_paise: 9600, features: ["1,000 credits a month", "Email support"], cta: { label: "Get Basic", href: "/contact" } },
        { name: "Pro", badge: "Most popular", highlighted: true, price_monthly_paise: 3500, price_yearly_paise: 33600, features: ["3,750 credits a month"], cta: { label: "Get Pro", href: "/contact" } },
        { name: "Max", badge: "Best value", price_monthly_paise: 6000, price_yearly_paise: 57600, features: ["6,600 credits a month"], cta: { label: "Get Max", href: "/contact" } },
        { name: "Enterprise", badge: "For teams", price_label: "Custom", features: ["Bespoke volume"], cta: { label: "Contact us", href: "mailto:sales@example.test", copy: true } },
      ] }],
    },
  });
  check(block.status === 201, "the banded block saves", String(block.status));
  blockId = block.json?.data?.id;

  const page = await api("POST", "/admin/pages", {
    title: `Probe pricing ${stamp}`, status: "published", template: "builder",
    blocks: [{ id: crypto.randomUUID(), type: "content_block", hidden: false, data: { block_id: blockId } }],
  });
  check(page.status === 201, "a builder page holds it", String(page.status));
  pageId = page.json?.data?.id;
  const slug = page.json?.data?.slug;
  if (process.env.KEEP) console.log(`page: /${slug}`);

  for (const theme of ["terminal", "classic"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    const view = await ctx.newPage();
    await signInAsStaff(view); // the theme preview is for staff
    await view.goto(`${BASE}/theme-preview/${theme}/page/${slug}`, { waitUntil: "load", timeout: 180000 });
    await view.waitForTimeout(3000); // hydration: the switch is an island
    const table = view.locator('[data-pricing-layout="banded"]');
    await table.waitFor({ timeout: 60000 });
    const basic = table.locator("article").first();

    check((await basic.innerText()).includes("₹10"), `${theme}: monthly shows ₹10`);
    check(!(await basic.getByText(/save/i).isVisible().catch(() => false)), `${theme}: monthly claims no saving`);

    await view.getByRole("button", { name: "Yearly" }).click();
    const text = (await basic.innerText()).replace(/\s+/g, " ");
    check(/₹10 ₹8 \/mo/.test(text), `${theme}: yearly strikes ₹10 and shows ₹8 /mo`, text.slice(0, 120));
    check(/₹96 billed yearly · save ₹24/i.test(text), `${theme}: billed yearly, save ₹24`);
    check(/20% off/i.test(text), `${theme}: 20% off`);
    check(await view.getByText("20% off · ends soon").isVisible(), `${theme}: the promo chip`);
    check(await view.locator("[data-pricing-guarantees]").getByText("Cancel anytime").isVisible(), `${theme}: the trust strip`);

    await view.getByRole("button", { name: "Copy email address" }).click();
    const copied = await view.evaluate(() => navigator.clipboard.readText());
    check(copied === "sales@example.test", `${theme}: the copy button copies the address`, copied);

    if (SHOTS) {
      await table.screenshot({ path: `${SHOTS}/banded-${theme}-1280.png` });
      await view.setViewportSize({ width: 360, height: 900 });
      await view.waitForTimeout(800);
      await view.screenshot({ path: `${SHOTS}/banded-${theme}-360.png`, fullPage: true });
    }
    await ctx.close();
  }
} catch (error) {
  check(false, "the run finished", String(error).slice(0, 300));
} finally {
  if (process.env.KEEP) {
    console.log(`kept: block ${blockId}, page ${pageId}`);
    pageId = blockId = null;
  }
  token = await signIn();
  if (pageId) check((await api("DELETE", `/admin/pages/${pageId}`)).status < 300, "the page was deleted");
  if (blockId) check((await api("DELETE", `/admin/blocks/${blockId}`)).status < 300, "the block was deleted");
  await api("POST", "/admin/auth/logout");
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
