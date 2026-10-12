import { chromium } from "playwright";

/**
 * The crop step before an upload (0.169.0, docs/media.md "Crop before
 * upload"), through the real console forms.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/crop-before-upload.mjs
 *   API (default http://127.0.0.1:8000/api/v1) is where it cleans up.
 *
 * On a new blog post's Cover (spec `cover`, 1200 × 630): (1) picking a
 * 3000 × 2000 JPEG opens the crop dialog, its first ratio "this field"'s and
 * pressed, the hint naming 1200 × 630; (2) zooming in makes the crop smaller;
 * (3) Crop & upload puts a 1200 × 630 picture in the preview; (4) Use whole
 * image puts the 3000 × 2000 one; (5) Cancel uploads nothing; (6) an SVG
 * goes up with no dialog. On a new product's gallery (7) three pictures are a
 * queue ("Picture 1 of 3") and "Upload the rest as they are" sends all
 * three. (8) Nothing is logged. Never submits a form; **every file it
 * uploads is deleted and purged** afterwards through the API with its own
 * session. Carries no credential.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
process.env.BASE = BASE;
const API = process.env.API ?? "http://127.0.0.1:8000/api/v1";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("dialog", (d) => d.accept().catch(() => {}));
let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });

const uploaded = [];
page.on("response", async (r) => {
  if (!r.url().includes("/api/admin/media/upload") || r.request().method() !== "POST") return;
  const body = await r.json().catch(() => null);
  if (body?.data?.id) uploaded.push(body.data.id);
});

const { signInAsStaff } = await import("../shared.mjs");
await signInAsStaff(page);
const go = async (p) => { await page.goto(`${BASE}${p}`, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(1500); };

// A 3000 × 2000 JPEG drawn by the browser, and a small SVG.
await go("/admin");
const jpeg = Buffer.from(await page.evaluate(async () => {
  const c = document.createElement("canvas");
  c.width = 3000; c.height = 2000;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 3000, 2000);
  g.addColorStop(0, "#3b5bdb"); g.addColorStop(1, "#f59f00");
  x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}), "base64");
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#3b5bdb"/></svg>');
const file = (name, buffer, mimeType) => ({ name, mimeType, buffer });

const dialog = page.locator("dialog[data-crop-before-upload][open]");
const coverInput = page.locator('input[type="hidden"][name="cover_image_path"]');
const coverFile = coverInput.locator("xpath=..").locator('input[type="file"]').first();
const preview = () => page.evaluate(() => {
  const hidden = document.querySelector('input[type="hidden"][name="cover_image_path"]');
  const img = hidden?.parentElement?.querySelector("img");
  return img && img.complete ? `${img.naturalWidth}x${img.naturalHeight}` : null;
});
const waitPreview = async (want) => {
  for (let i = 0; i < 360; i++) { if ((await preview()) === want) return true; await page.waitForTimeout(500); }
  return false;
};

await go("/admin/blog/new");
await coverInput.waitFor({ state: "attached", timeout: 240000 });
await page.waitForFunction(() => document.querySelector("[data-tour], [data-console]") && !document.querySelector("[data-nextjs-dialog]"), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000); // hydration, on a slow dev server
await coverFile.setInputFiles(file("big.jpg", jpeg, "image/jpeg"));
await dialog.waitFor({ timeout: 15000 }).catch(() => {});
ok(await dialog.count() === 1, "picking a JPEG opens the crop dialog");
const first = dialog.locator('[role="group"][aria-label="Ratio"] button').first();
ok((await first.textContent())?.includes("this field") && (await first.getAttribute("aria-pressed")) === "true", "it starts on the field's own ratio");
ok((await dialog.textContent())?.includes("1200 × 630"), "the hint names 1200 × 630");
const size = () => dialog.locator("[data-crop-size]").textContent();
const before = await size();
await dialog.locator("[data-crop-zoom]").fill("2");
await page.waitForTimeout(300);
const after = await size();
const w = (t) => Number((t ?? "").split("×")[0].trim());
ok(w(after) < w(before), `zooming in crops less (${before} → ${after})`);
await dialog.locator("[data-crop-confirm]").click();
ok(await waitPreview("1200x630"), "Crop & upload puts a 1200 × 630 picture in the field");

await coverFile.setInputFiles(file("big2.jpg", jpeg, "image/jpeg"));
await dialog.waitFor({ timeout: 15000 }).catch(() => {});
await dialog.locator("[data-crop-whole]").click();
ok(await waitPreview("3000x2000"), "Use whole image uploads it as it is");

const count = uploaded.length;
await coverFile.setInputFiles(file("big3.jpg", jpeg, "image/jpeg"));
await dialog.waitFor({ timeout: 15000 }).catch(() => {});
await dialog.getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(2000);
ok(uploaded.length === count && (await preview()) === "3000x2000", "Cancel uploads nothing and changes nothing");

await coverFile.setInputFiles(file("mark.svg", svg, "image/svg+xml"));
await page.waitForTimeout(1500);
ok(await dialog.count() === 0, "an SVG opens no dialog");
for (let i = 0; i < 60 && uploaded.length === count; i++) await page.waitForTimeout(500);
ok(uploaded.length === count + 1, "and goes up as it is");

await go("/admin/products/new");
await page.locator('input[type="file"][multiple]').first().waitFor({ state: "attached", timeout: 240000 });
await page.waitForTimeout(3000);
const galleryFile = page.locator('input[type="file"][multiple]').first();
await galleryFile.setInputFiles([file("a.jpg", jpeg, "image/jpeg"), file("b.jpg", jpeg, "image/jpeg"), file("c.jpg", jpeg, "image/jpeg")]);
await dialog.waitFor({ timeout: 15000 }).catch(() => {});
ok((await dialog.textContent())?.includes("Picture 1 of 3"), "three gallery pictures are a queue");
const n0 = uploaded.length;
await dialog.getByRole("button", { name: "Upload the rest as they are" }).click();
for (let i = 0; i < 400 && uploaded.length < n0 + 3; i++) await page.waitForTimeout(500);
ok(uploaded.length === n0 + 3, "Upload the rest as they are sends all three");
await page.waitForTimeout(1000);

ok(errors.length === 0, `nothing logged${errors.length ? `: ${errors.join(" | ")}` : ""}`);

// Clean up with this session's own token.
const cookie = (await context.cookies()).find((c) => c.name === "tw_admin_session");
const token = cookie ? decodeURIComponent(cookie.value) : null;
let removed = 0;
for (const id of uploaded) {
  if (!token) break;
  const h = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const a = await fetch(`${API}/admin/media/${id}`, { method: "DELETE", headers: h }).catch(() => null);
  const b = await fetch(`${API}/admin/media/${id}/purge`, { method: "DELETE", headers: h }).catch(() => null);
  if (a?.ok && b?.ok) removed++;
}
ok(removed === uploaded.length, `every upload deleted and purged (${removed} of ${uploaded.length})`);

await browser.close();
process.exit(failed ? 1 : 0);
