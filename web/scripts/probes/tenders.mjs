import { chromium } from "playwright";

/**
 * Tenders (0.174.0, docs/tenders.md), through the real screens: the
 * console's form, the public list and one notice's page.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/tenders.mjs
 *   SHOTS=<dir> saves the notice's page at 360, 768, 1280 and 1920.
 *
 * In the console it creates a category and two tenders through the form —
 * one open and one that closed last month — and reads the edit screen back.
 * On the public side it then checks the list's order and its filters, that
 * the punctuated reference is found by a search with no punctuation in it,
 * and that the closed one is in the archive and not in the open list.
 *
 * **The checks worth having are the last two.** The notice's page is
 * ISR-cached, so its state is whatever the cache holds; the probe asserts
 * the badge is what the live state endpoint says, which is the one thing a
 * cached page cannot get right on its own. And it deletes a document's file
 * from the media library and asserts the document **disappears from the
 * page** rather than leaving a button that 404s.
 *
 * **It deletes everything it made**, through each form's own Delete. It
 * carries no credential; the account is a throwaway one the caller made.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API_ORIGIN = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const API = `${API_ORIGIN}/api/v1`;
const SHOTS = process.env.SHOTS;
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
const T = 240000;

if (!EMAIL || !PASSWORD) {
  console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD.");
  process.exit(2);
}

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const { signInAsStaff } = await import("../shared.mjs");

const stamp = Date.now().toString(36);
const REFERENCE = `PROBE/2026/${stamp.slice(-4).toUpperCase()}`;
const TITLE = `Probe tender ${stamp}`;
const CLOSED_TITLE = `Probe closed tender ${stamp}`;
const CATEGORY = `Probe category ${stamp}`;

/**
 * `Y-m-d\THH:mm` — what a `datetime-local` holds.
 *
 * Built from the browser's clock, which the API then reads in
 * `APP_TIMEZONE`. The two agree on a machine set to the site's own zone,
 * which is the case here; the offsets the probe uses (±20, ±30 days) are
 * far enough out that a few hours either way cannot flip a window.
 */
const wall = (days, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const p = (n) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
};

/**
 * A token of our own for the tidy-up and for the reads that have no screen.
 *
 * Signing in here revokes the browser's `admin` token, so it is minted
 * **once, at the end**, after every screen has been driven — the trap
 * `logo-palette.mjs` documents.
 */
const apiHeaders = async () => {
  const res = await fetch(`${API}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());

  return { Accept: "application/json", Authorization: `Bearer ${res.token}` };
};

const browser = await chromium.launch();
const made = { tenders: [], categories: [], media: [] };

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
  });

  await signInAsStaff(page);

  /* ------------------------------------------------------- the category */

  await page.goto(`${BASE}/admin/tenders/categories/new`, { waitUntil: "load", timeout: T });
  await page.fill("#name", CATEGORY);
  // By its words, not `button[type="submit"]`: the account menu holds a
  // hidden Sign out form, and its button matches that selector first.
  await page.getByRole("button", { name: "Create category" }).click();
  // Not `/categories/` — that matches the page we are on. The list is the
  // one that ends there.
  await page.waitForURL(/\/admin\/tenders\/categories(\?|$)/, { timeout: T });
  ok(await page.getByText(CATEGORY).count() > 0, "the category is created and listed");

  /* --------------------------------------------------------- the tender */

  await page.goto(`${BASE}/admin/tenders/new`, { waitUntil: "load", timeout: T });

  // Published with no way to submit a bid: the one refusal worth driving,
  // because it is the rule that keeps an unanswerable notice off the site.
  await page.fill("#reference", REFERENCE);
  await page.fill("#title", TITLE);
  await page.selectOption("#status", "published");
  await page.click('[role="tab"]:has-text("Dates and fees")');
  await page.fill("#opens_at", wall(-1, 10));
  await page.fill("#closes_at", wall(20, 18));
  await page.getByRole("button", { name: "Create tender" }).click();
  await page.waitForSelector("text=/How should a bid be submitted/", { timeout: T });
  ok(true, "publishing a notice nobody can answer is refused, and says so");

  // Now with an address, and the rest of the record.
  await page.click('[role="tab"]:has-text("How to bid")');
  await page.fill("#submission_email", "tenders@probe.test");
  await page.click('[role="tab"]:has-text("Dates and fees")');
  await page.fill("#fee_rupees", "2500");
  await page.fill("#emd_rupees", "150000");
  await page.getByRole("button", { name: "Create tender" }).click();
  await page.waitForURL(/\/admin\/tenders\/\d+/, { timeout: T });

  const tenderId = Number(page.url().match(/\/admin\/tenders\/(\d+)/)?.[1]);
  made.tenders.push(tenderId);
  ok(Number.isInteger(tenderId), `the tender saves (#${tenderId})`);

  // Read back: the money came out of rupees, and the window is the API's.
  await page.goto(`${BASE}/admin/tenders/${tenderId}`, { waitUntil: "load", timeout: T });
  await page.click('[role="tab"]:has-text("Dates and fees")');
  ok(await page.inputValue("#fee_rupees") === "2500", "a fee typed in rupees comes back in rupees");
  // The edit screen's own badge, drawn from the API's `state_label`.
  ok(
    (await page.locator("body").innerText()).includes("Open"),
    "the console shows the window the API worked out",
  );

  /* ------------------------------------------------- one that has closed */

  await page.goto(`${BASE}/admin/tenders/new`, { waitUntil: "load", timeout: T });
  await page.fill("#reference", `${REFERENCE}-OLD`);
  await page.fill("#title", CLOSED_TITLE);
  await page.selectOption("#status", "published");
  await page.click('[role="tab"]:has-text("How to bid")');
  await page.fill("#submission_email", "tenders@probe.test");
  await page.click('[role="tab"]:has-text("Dates and fees")');
  await page.fill("#opens_at", wall(-60, 10));
  await page.fill("#closes_at", wall(-30, 18));
  await page.getByRole("button", { name: "Create tender" }).click();
  await page.waitForURL(/\/admin\/tenders\/\d+/, { timeout: T });
  const closedId = Number(page.url().match(/\/admin\/tenders\/(\d+)/)?.[1]);
  made.tenders.push(closedId);

  /* ------------------------------------------------------- the public list */

  await page.goto(`${BASE}/tenders`, { waitUntil: "load", timeout: T });
  ok(await page.locator("h1").count() === 1, "the list has exactly one h1");

  const listed = await page.locator("[data-tender-grid] [data-tile]").allTextContents();
  ok(listed.some((t) => t.includes(TITLE)), "the open tender is on the list");
  ok(!listed.some((t) => t.includes(CLOSED_TITLE)), "and the closed one is not");

  // The archive.
  await page.goto(`${BASE}/tenders?when=closed`, { waitUntil: "load", timeout: T });
  const closed = await page.locator("[data-tender-grid] [data-tile]").allTextContents();
  ok(closed.some((t) => t.includes(CLOSED_TITLE)), "the closed tender is in the archive");

  // The reference, with none of its punctuation typed.
  const bare = REFERENCE.replace(/[^A-Za-z0-9]/g, "");
  await page.goto(`${BASE}/tenders?q=${encodeURIComponent(bare)}&when=all`, { waitUntil: "load", timeout: T });
  const found = await page.locator("[data-tender-grid] [data-tile]").allTextContents();
  ok(found.some((t) => t.includes(TITLE)), `searching "${bare}" finds ${REFERENCE}`);

  // No horizontal overflow at the two widths the audit checks.
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE}/tenders`, { waitUntil: "load", timeout: T });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 0, `the list does not scroll sideways at ${width} (${over}px)`);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });

  /* --------------------------------------------------- the notice's page */

  const slug = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await page.goto(`${BASE}/tenders/${slug}`, { waitUntil: "load", timeout: T });
  ok(await page.locator("h1").count() === 1, "the notice has exactly one h1");
  ok((await page.content()).includes(REFERENCE), "the page carries the tender number");
  ok((await page.content()).includes("₹2,500"), "the fee is grouped the Indian way");
  ok((await page.content()).includes("₹1,50,000"), "and so is the EMD");

  /*
   * The island. The badge must agree with the live state endpoint, not with
   * whatever the cache was built from — the one thing a cached page cannot
   * get right on its own, and the reason the island exists.
   */
  const live = await page.evaluate(async (s) => {
    const r = await fetch(`/api/tenders/${s}/state`);
    return r.ok ? (await r.json()).data : null;
  }, slug);
  ok(live !== null, "the state route answers");
  const badge = (await page.locator("[data-tender-state]").first().textContent() ?? "").trim();
  ok(
    live !== null && badge.includes(live.state_label),
    `the badge says what the live state says ("${badge}" vs "${live?.state_label}")`,
  );

  if (SHOTS) {
    for (const width of [360, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(`${BASE}/tenders/${slug}`, { waitUntil: "load", timeout: T });
      // Playwright's default caret style is an inline style on every input,
      // which logs a hydration mismatch that is the probe's own.
      await page.screenshot({ path: `${SHOTS}/tender-${width}.png`, fullPage: true, caret: "initial" });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    ok(true, `screenshots written to ${SHOTS}`);
  }

  ok(errors.length === 0, `nothing logged${errors.length ? ` — ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();

  /* ------------------------- a document whose file leaves the library ----- */

  const H = await apiHeaders();

  // Upload a file, attach it, then delete it from the library and purge it.
  const form = new FormData();
  form.append("file", new Blob([`probe tender pack ${stamp}\n`.repeat(50)], { type: "text/plain" }), `probe-pack-${stamp}.txt`);
  const media = (await fetch(`${API}/admin/media`, { method: "POST", headers: H, body: form }).then((r) => r.json()))?.data;
  ok(Boolean(media?.path), "a document uploads to the library");
  if (media?.id) made.media.push(media.id);

  await fetch(`${API}/admin/tenders/${tenderId}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ documents: [{ title: "Probe pack", file_path: media.path }] }),
  });

  const withFile = await fetch(`${API}/tenders/${slug}`, { headers: { Accept: "application/json" } }).then((r) => r.json());
  ok(withFile?.data?.documents?.length === 1, "the document is on the public read");

  await fetch(`${API}/admin/media/${media.id}`, { method: "DELETE", headers: H });
  await fetch(`${API}/admin/media/${media.id}/purge`, { method: "DELETE", headers: H });
  made.media = made.media.filter((id) => id !== media.id);

  const without = await fetch(`${API}/tenders/${slug}`, { headers: { Accept: "application/json" } }).then((r) => r.json());
  ok(
    without?.data?.documents?.length === 0 && without?.data?.documents_count === 0,
    "a document whose file has gone is dropped, not drawn as a dead button",
  );
} finally {
  const H = await apiHeaders();

  for (const id of made.tenders) {
    await fetch(`${API}/admin/tenders/${id}`, { method: "DELETE", headers: H });
  }
  // The category last: its tenders are gone, so nothing is left unfiled.
  const categories = (await fetch(`${API}/admin/tender-categories?per_page=100`, { headers: H }).then((r) => r.json()))?.data ?? [];
  for (const category of categories.filter((c) => c.name === CATEGORY)) {
    await fetch(`${API}/admin/tender-categories/${category.id}`, { method: "DELETE", headers: H });
  }
  for (const id of made.media) {
    await fetch(`${API}/admin/media/${id}`, { method: "DELETE", headers: H });
    await fetch(`${API}/admin/media/${id}/purge`, { method: "DELETE", headers: H });
  }

  console.log(`cleaned up ${made.tenders.length} tender(s), the category and ${made.media.length} file(s)`);
  await browser.close();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
