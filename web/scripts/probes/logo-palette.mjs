import { chromium } from "playwright";
import { signInAsStaff } from "../shared.mjs";

/**
 * Colours taken from the logo (0.173.0, docs/theming.md "Brand from a logo").
 *
 *   BASE=http://localhost:3000 ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/logo-palette.mjs
 *
 * Uploads a two-colour SVG whose hexes it knows and sets it as the logo, then
 * on Site → Settings → Colour palette: the button answers tiles whose first reading leads with
 * the colour the logo is mostly made of, pressing a tile fills the six colour
 * fields, and **the stored settings do not move** — Save is what applies it.
 * Then a grey wordmark, which must be refused in the API's own words. The
 * logo setting is put back and every file it made is deleted.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API_ORIGIN = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const API = `${API_ORIGIN}/api/v1`;
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

/** Two thirds blue, one third pink — so "most of the logo" is the blue. */
const BLUE = "#1d4ed8";
const PINK = "#e11d48";
const COLOURED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="64" fill="${BLUE}"/><rect y="70" width="100" height="30" fill="${PINK}"/></svg>`;
const GREY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#111111"/><path d="M10 10h20v20H10z" fill="#ffffff"/></svg>';

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const login = async () => {
  const l = await fetch(`${API}/admin/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  return { Accept: "application/json", Authorization: `Bearer ${l.token}` };
};

async function upload(H, name, body) {
  const form = new FormData();
  form.append("file", new Blob([body], { type: "image/svg+xml" }), name);
  const r = await fetch(`${API}/admin/media`, { method: "POST", headers: H, body: form });
  return (await r.json().catch(() => ({})))?.data ?? null;
}

const settings = async (H) => {
  const res = await fetch(`${API}/admin/settings`, { headers: H }).then((r) => r.json());
  const rows = Object.values(res.data ?? {}).flat();
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
};

const setLogo = (H, path) => fetch(`${API}/admin/settings`, {
  method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ settings: [{ key: "logo_path", value: path }] }),
});

const made = [];
let H = await login();
const before = await settings(H);
const browser = await chromium.launch();

try {
  const coloured = await upload(H, "probe-logo-colour.svg", COLOURED);
  const grey = await upload(H, "probe-logo-grey.svg", GREY);
  ok(!!coloured?.path && !!grey?.path, "both probe logos upload to the library");
  for (const m of [coloured, grey]) if (m?.id) made.push(m.id);

  await setLogo(H, coloured.path);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });

  // Sign in through the real form, so this is the screen an editor sees.
  // `signInAsStaff` knows the sign-in opens on the code step and switches to
  // the password form first; waiting for any /admin/ URL would match the
  // login page itself and read as a sign-in that never happened.
  await signInAsStaff(page);

  await page.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 240000 });
  // Custom colours holds the button; the panel is hidden until it is chosen.
  // The radio is `sr-only` inside its label, which is what takes the press.
  // The wait is explicit because this screen is every public setting there is
  // and the dev server can take a while to draw it.
  const customLabel = page.locator('label:has(input[type="radio"][value="custom"])').first();
  await customLabel.waitFor({ state: "visible", timeout: 180000 });
  await customLabel.click();
  ok(await page.locator("[data-logo-palette]").isVisible(), "the panel is under Custom colours on the palette screen");

  await page.locator("[data-logo-palette-read]").click();
  const tiles = page.locator("[data-logo-reading]");
  await tiles.first().waitFor({ timeout: 60000 });
  ok(await tiles.count() >= 1, `the logo answers at least one reading (${await tiles.count()})`);

  const first = tiles.first();
  // React writes the swatch as `rgb(...)`, so compare what the browser paints.
  const painted = await first.locator("span > span").evaluateAll(
    (els) => els.map((e) => getComputedStyle(e).backgroundColor),
  );
  ok(painted.includes("rgb(29, 78, 216)"), `the first reading leads with the colour the logo is mostly made of (${BLUE} — painted ${painted.slice(0, 2).join(", ")})`);

  await first.click();
  // The fields are the settings form's, so each id carries its prefix.
  const field = (key) => page.locator(`#setting__${key}`).inputValue();
  const primary = (await field("theme_primary")).toLowerCase();
  const secondary = (await field("theme_secondary")).toLowerCase();
  ok(primary === BLUE, `pressing a tile fills Primary (${primary})`);
  ok(secondary === PINK, `and Secondary (${secondary})`);

  const during = await settings(await login());
  ok(
    during.theme_primary === before.theme_primary && during.theme === before.theme,
    `nothing is stored until Save (theme ${during.theme}, primary ${during.theme_primary})`,
  );

  // A wordmark with no colour: refused in the API's own words.
  //
  // On a second page of the same context, not a reload: pressing a tile left
  // the settings form dirty, and its leave guard stops a reload — which reads
  // as the screen not loading rather than as the guard doing its job.
  H = await login();
  await setLogo(H, grey.path);
  // `runBeforeUnload: false` skips the dirty form's leave guard rather than
  // arguing with it: this page's work is done.
  await page.close({ runBeforeUnload: false });
  const greyPage = await ctx.newPage();
  greyPage.on("pageerror", (e) => errors.push(e.message));
  // Signed in again, because `login()` above minted an `admin` token and a
  // sign-in revokes the previous token of the same name — so the API calls
  // between the two pages killed the browser's session. Without this the
  // page lands on /admin/login and reads as a screen that would not draw.
  await signInAsStaff(greyPage);
  await greyPage.goto(`${BASE}/admin/site/settings?tab=appearance`, { waitUntil: "load", timeout: 240000 });
  // The radio is `sr-only` inside its label, which is what takes the press.
  // The wait is explicit because this screen is every public setting there is
  // and the dev server can take a while to draw it.
  const greyCustomLabel = greyPage.locator('label:has(input[type="radio"][value="custom"])').first();
  await greyCustomLabel.waitFor({ state: "visible", timeout: 180000 });
  await greyCustomLabel.click();
  await greyPage.locator("[data-logo-palette-read]").click();
  const refusal = greyPage.locator("[data-logo-palette-error]");
  await refusal.waitFor({ timeout: 60000 });
  const words = (await refusal.textContent()) ?? "";
  ok(/grey/i.test(words), `a black-and-white wordmark is refused and says why — "${words.trim().slice(0, 60)}…"`);
  ok(await greyPage.locator("[data-logo-reading]").count() === 0, "and offers no reading");

  ok(errors.length === 0, `nothing logged${errors.length ? ` — ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();
} finally {
  H = await login();
  await setLogo(H, before.logo_path ?? "");
  for (const id of made) {
    await fetch(`${API}/admin/media/${id}`, { method: "DELETE", headers: H });
    await fetch(`${API}/admin/media/${id}/purge`, { method: "DELETE", headers: H });
  }
  const after = await settings(H);
  console.log(`logo put back to "${after.logo_path ?? ""}", deleted ${made.length} file(s)`);
  await browser.close();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
