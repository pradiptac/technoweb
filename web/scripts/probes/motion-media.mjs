import { chromium } from "playwright";

/**
 * Animation and 3D-model sections (0.172.0, docs/page-builder.md
 * "Animation and 3D model").
 *
 *   BASE=http://localhost:3000 ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/motion-media.mjs
 *
 * Generates a tiny Lottie (a square turning, looping) and a tiny binary glTF
 * (one triangle), uploads both to the media library through the API, builds
 * a published builder page with an animation section and a 3D-model section,
 * and checks: the animation plays when scrolled to (its drawing changes) and
 * Pause holds it; reduced motion keeps it on its first frame; the
 * `<model-viewer>` arrives and has no `auto-rotate` under reduced motion; no
 * request leaves the site's own and the asset origins; no sideways scroll at
 * 320; nothing logged. Also refuses a Lottie that points at another site.
 * Everything it made is deleted at the end.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API_ORIGIN = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const API = `${API_ORIGIN}/api/v1`;
const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const login = async () => {
  const l = await fetch(`${API}/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }).then((r) => r.json());
  return { Accept: "application/json", Authorization: `Bearer ${l.token}` };
};

/** A 100×100 Lottie: a brand-blue square turning a full circle over 60 frames. */
function lottie(extra = {}) {
  return JSON.stringify({
    v: "5.7.4", fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: "probe", ddd: 0, assets: [], ...extra,
    layers: [{
      ddd: 0, ind: 1, ty: 4, nm: "square", sr: 1, ip: 0, op: 60, st: 0, bm: 0,
      ks: { o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0], i: { x: [0.5], y: [0.5] }, o: { x: [0.5], y: [0.5] } }, { t: 60, s: [360] }] }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      shapes: [{ ty: "gr", it: [
        { ty: "rc", d: 1, s: { a: 0, k: [50, 50] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 6 } },
        { ty: "fl", c: { a: 0, k: [0.15, 0.35, 0.75, 1] }, o: { a: 0, k: 100 }, r: 1 },
        { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ] }],
    }],
  });
}

/** A binary glTF holding one triangle. */
function glb() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = Buffer.from(positions.buffer);
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  }));
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(json, 0x20); const bb = pad(bin, 0);
  const total = 12 + 8 + j.length + 8 + bb.length;
  const header = Buffer.alloc(12); header.write("glTF", 0, "ascii"); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.write("JSON", 4, "ascii");
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bb.length, 0); bh.write("BIN\0", 4, "ascii");
  return Buffer.concat([header, jh, j, bh, bb]);
}

async function upload(H, name, body, type) {
  const form = new FormData();
  form.append("file", new Blob([body], { type }), name);
  const r = await fetch(`${API}/admin/media`, { method: "POST", headers: H, body: form });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const made = { media: [], pages: [] };
let H = await login();
const browser = await chromium.launch();
try {
  const anim = await upload(H, "probe-turning-square.json", lottie(), "application/json");
  ok(anim.status === 201 && anim.json.data?.path, `a Lottie uploads to the library (${anim.status})`);
  if (anim.json.data?.id) made.media.push(anim.json.data.id);
  const model = await upload(H, "probe-triangle.glb", glb(), "model/gltf-binary");
  ok(model.status === 201 && model.json.data?.path, `a .glb uploads to the library (${model.status})`);
  if (model.json.data?.id) made.media.push(model.json.data.id);
  const external = await upload(H, "probe-external.json", lottie({ assets: [{ id: "img_0", w: 10, h: 10, u: "https://example.com/", p: "a.png", e: 0 }] }), "application/json");
  ok(external.status === 422, `a Lottie that loads pictures from another site is refused (${external.status})`);
  if (external.json.data?.id) made.media.push(external.json.data.id);

  const slug = `motion-probe-${Date.now()}`;
  const page = await fetch(`${API}/admin/pages`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({
    title: "Motion probe", slug, template: "builder", status: "published", blocks: [
      { id: crypto.randomUUID(), type: "rich_text", hidden: false, background: null, data: { body: `<p>${"A paragraph to push the animation below the first screen. ".repeat(30)}</p>` } },
      { id: crypto.randomUUID(), type: "lottie", hidden: false, background: null, data: { heading: "A turning square", file_path: anim.json.data?.path, alt: "A blue square turning", loop: true } },
      { id: crypto.randomUUID(), type: "model", hidden: false, background: null, data: { heading: "A triangle", file_path: model.json.data?.path, alt: "A flat triangle", rotate: true } },
    ],
  }) }).then((r) => r.json());
  ok(!!page.data?.id, "a builder page with both sections saves");
  if (page.data?.id) made.pages.push(page.data.id);

  const allowed = new Set([new URL(BASE).host, new URL(API_ORIGIN).host, "localhost:8000", "127.0.0.1:8000"]);
  const foreign = []; const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("request", (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !allowed.has(u.host)) foreign.push(u.host); });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await p.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: 240000 });
  await p.locator('[data-page-section="lottie"]').scrollIntoViewIfNeeded();
  const ready = await p.waitForSelector("[data-lottie-ready] svg", { timeout: 60000 }).then(() => true, () => false);
  ok(ready, "the animation loads when scrolled to");
  const drawing = () => p.locator("[data-lottie] svg").first().evaluate((s) => s.innerHTML);
  const a = await drawing(); await p.waitForTimeout(700); const b = await drawing();
  ok(a !== b, "it plays (its drawing changes)");
  await p.locator('button[aria-label="Pause the animation"]').click();
  const c = await drawing(); await p.waitForTimeout(700); const d = await drawing();
  ok(c === d, "Pause holds it");
  await p.locator('[data-page-section="model"]').scrollIntoViewIfNeeded();
  const viewer = await p.waitForSelector("model-viewer", { timeout: 90000 }).then(() => true, () => false);
  ok(viewer, "the 3D model's viewer arrives");
  ok(await p.locator("model-viewer[auto-rotate]").count() === 1, "it turns by itself with motion allowed");
  await p.waitForTimeout(4000);
  ok(foreign.length === 0, `nothing is fetched from another site${foreign.length ? ` — ${[...new Set(foreign)].join(", ")}` : ""}`);
  ok(errors.length === 0, `nothing logged${errors.length ? ` — ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();

  const rm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const q = await rm.newPage();
  await q.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: 240000 });
  await q.locator('[data-page-section="lottie"]').scrollIntoViewIfNeeded();
  await q.waitForSelector("[data-lottie-ready] svg", { timeout: 60000 }).catch(() => {});
  const e = await q.locator("[data-lottie] svg").first().evaluate((s) => s.innerHTML).catch(() => "");
  await q.waitForTimeout(800);
  const f = await q.locator("[data-lottie] svg").first().evaluate((s) => s.innerHTML).catch(() => "-");
  ok(e !== "" && e === f, "reduced motion: the animation holds its first frame");
  await q.locator('[data-page-section="model"]').scrollIntoViewIfNeeded();
  await q.waitForSelector("model-viewer", { timeout: 90000 }).catch(() => {});
  ok(await q.locator("model-viewer").count() === 1 && await q.locator("model-viewer[auto-rotate]").count() === 0, "reduced motion: the model does not turn by itself");
  await rm.close();

  const narrow = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const n = await narrow.newPage();
  await n.goto(`${BASE}/${slug}`, { waitUntil: "load", timeout: 240000 });
  await n.waitForTimeout(3000);
  const sw = await n.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 320, `320px: no sideways scroll (${sw})`);
  await narrow.close();
} finally {
  H = await login();
  for (const id of made.pages) await fetch(`${API}/admin/pages/${id}`, { method: "DELETE", headers: H });
  for (const id of made.media) {
    await fetch(`${API}/admin/media/${id}`, { method: "DELETE", headers: H });
    await fetch(`${API}/admin/media/${id}/purge`, { method: "DELETE", headers: H });
  }
  console.log(`deleted ${made.pages.length} page(s), ${made.media.length} file(s)`);
  await browser.close();
}
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
