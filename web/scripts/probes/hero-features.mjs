import { chromium } from "playwright";

/**
 * The homepage hero slider's eight features, end to end (0.191.0).
 *
 * Reads `homepage-hero`, sets it up with two image slides that use everything
 * (slide 1: dark words, strong shade, two buttons, a phone picture, 3 seconds;
 * slide 2: a square picture shown whole, 9 seconds; the slider zooms in and
 * navigates by thumbnails), and checks it on the Classic homepage preview:
 *
 *  - the console form shows every stored value, saves them back unchanged, and
 *    puts a 422 on a half-filled second button under that slide's field;
 *  - at 390px the phone picture is requested for slide 1 and the wide one is
 *    not (with dots; the thumbnail strip draws the wide picture small, on purpose);
 *  - the zoom's computed `scale` grows through slide 2 and is absent under
 *    reduced motion, which also stops the slides advancing;
 *  - slide 2 follows slide 1 after about 3 seconds and slide 1 follows slide 2
 *    after about 9;
 *  - the thumbnails switch slides and the strip sits below the picture;
 *  - the fit = whole picture slide is letterboxed, not cropped.
 *
 * Then puts the hero back (the API's PATCH from what was read first) and saves
 * it once in the console, which is what purges the website's cache.
 * Limitation: a slide's own alt text is read back as the resource shows it (its
 * own, else the library's description), so a hero whose slides had a blank alt
 * over a described file comes back with that description as its alt.
 *
 *   ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/hero-features.mjs
 *   BASE=http://localhost:3000   API=http://127.0.0.1:8000/api/v1   (defaults)
 *
 * Sign in with a throwaway administrator and delete it afterwards. It needs
 * three raster pictures in the media library (a landscape one wider than 3000px,
 * a portrait one, a square one). No credential is carried in this file.
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const API = process.env.API ?? "http://127.0.0.1:8000/api/v1";
const { ADMIN_LOGIN_EMAIL: email, ADMIN_LOGIN_PASSWORD: password } = process.env;
if (!email || !password) { console.error("Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD."); process.exit(2); }

const PREVIEW = `${BASE}/theme-preview/classic`;
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 120000 });
const toPassword = page.locator('button:has-text("Use your password instead")');
if (await toPassword.count()) {
  await toPassword.first().click();
  await page.waitForSelector("#password", { timeout: 15000 });
}
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 120000 }),
  page.click('button[type="submit"]'),
]);
const rawSession = (await context.cookies()).find((c) => c.name === "tw_admin_session")?.value;
const session = rawSession && decodeURIComponent(rawSession);
if (!session) { console.error("No staff session cookie after signing in."); await browser.close(); process.exit(2); }

async function api(path, method = "GET", body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const pathOf = (url) => (url ? url.split("/storage/").pop().split("?")[0] : null);
const base = (path) => path.split("/").pop();

/** A slider as the resource shows it, turned back into what PATCH takes. */
function payloadOf(s) {
  return {
    name: s.name, slug: s.slug, status: s.status, layout: s.layout, transition: s.transition,
    caption_animation: s.caption_animation, media_effect: s.media_effect, navigation: s.navigation,
    height: s.height, height_mobile: s.height_mobile, height_desktop: s.height_desktop,
    autoplay: s.autoplay, interval_ms: s.interval_ms,
    slides: (s.slides ?? []).map((x) => ({
      kind: x.kind, media_path: pathOf(x.url), poster_path: pathOf(x.poster_url), youtube_url: x.youtube_id,
      alt_text: x.alt, heading: x.heading, caption: x.caption, link_url: x.link_url, link_label: x.link_label,
      caption_position: x.caption_position, kicker: x.kicker, link2_url: x.link2_url, link2_label: x.link2_label,
      mobile_media_path: pathOf(x.mobile_url), text_tone: x.text_tone, overlay: x.overlay, fit: x.fit,
      duration_ms: x.duration_ms,
    })),
  };
}

const list = await api("/admin/sliders?per_page=100");
const found = list.data.find((s) => s.slug === "homepage-hero");
const original = found ? (await api(`/admin/sliders/${found.id}`)).data : null;
const originalPayload = original ? payloadOf(original) : null;

async function consoleSave(id) {
  await page.goto(`${BASE}/admin/sliders/${id}`, { waitUntil: "load", timeout: 120000 });
  await page.getByRole("button", { name: "Save slider" }).click();
  await page.waitForURL(/saved=1/, { timeout: 60000 });
}

let heroId = original?.id ?? null;
try {
  // Pictures: a wide landscape for slide 1, a portrait for its phone picture, a square for slide 2.
  const media = (await api("/admin/media?kind=image&per_page=100")).data
    .filter((m) => /^image\/(jpeg|png|webp)$/.test(m.mime));
  const wide = media.find((m) => m.width >= 3000 && m.width > m.height);
  const phone = media.find((m) => m.height > m.width * 1.3 && m.path !== wide?.path);
  const square = media.find((m) => m.width === m.height && m.path !== wide?.path && m.path !== phone?.path);
  if (!wide || !phone || !square) throw new Error("The library needs a wide (3000px+), a portrait and a square raster picture.");

  const slides = [
    {
      kind: "image", media_path: wide.path, alt_text: "Probe slide one", heading: "Probe heading one", caption: "Probe caption one",
      link_url: "/solutions", link_label: "See solutions", link2_url: "/contact", link2_label: "Talk to us",
      caption_position: "bottom-left", mobile_media_path: phone.path, text_tone: "dark", overlay: "strong", fit: "cover", duration_ms: 3000,
    },
    {
      kind: "image", media_path: square.path, alt_text: "Probe slide two", heading: "Probe heading two", caption: null,
      caption_position: "bottom-left", text_tone: "light", overlay: "standard", fit: "contain", duration_ms: null,
    },
  ];
  const setup = {
    ...(originalPayload ?? { name: "Homepage hero", slug: "homepage-hero", status: "published", transition: "fade", caption_animation: "fade", interval_ms: 6000 }),
    layout: "full", autoplay: true, media_effect: "none", navigation: "dots", height: "theme", height_mobile: null, height_desktop: null,
    slides,
  };
  if (heroId) await api(`/admin/sliders/${heroId}`, "PATCH", setup);
  else heroId = (await api("/admin/sliders", "POST", setup)).data.id;

  // 1. The console shows what is stored, and a save returns it unchanged. (It also purges the website's cache.)
  await page.goto(`${BASE}/admin/sliders/${heroId}`, { waitUntil: "load", timeout: 120000 });
  const val = (label, n) => page.getByLabel(label, { exact: true }).nth(n).inputValue();
  check((await val("Text colour", 0)) === "dark" && (await val("Shade behind the words", 0)) === "strong", "console: slide 1 text colour and shade");
  check((await val("Second button URL", 0)) === "/contact" && (await val("Second button label", 0)) === "Talk to us", "console: second button");
  check((await val("Show for (seconds)", 0)) === "3" && (await val("Show for (seconds)", 1)) === "", "console: show-for 3 and blank");
  check((await val("Picture fit", 1)) === "contain" && (await val("Picture fit", 0)) === "cover", "console: picture fit");
  check((await page.locator(`img[src*="${base(phone.path)}"]`).count()) > 0, "console: phone picture preview");
  check((await page.locator("#media_effect option").count()) === 4 && (await page.locator("#navigation option").count()) === 4
    && (await page.locator("#height option").count()) === 3, "console: option lists come from the API");
  await page.selectOption("#height", "fixed");
  check((await page.locator("#height_mobile").count()) === 1 && (await page.locator("#height_desktop").count()) === 1, "console: Fixed height shows On phones / On larger screens");
  await page.selectOption("#height", "theme");
  await page.getByRole("button", { name: "Save slider" }).click();
  await page.waitForURL(/saved=1/, { timeout: 60000 });
  const back = payloadOf((await api(`/admin/sliders/${heroId}`)).data);
  const s0 = back.slides[0]; const s1 = back.slides[1];
  check(s0.link2_url === "/contact" && s0.link2_label === "Talk to us" && s0.mobile_media_path === phone.path
    && s0.text_tone === "dark" && s0.overlay === "strong" && s0.duration_ms === 3000 && s0.fit === "cover", "round trip: slide 1 fields survive the console save");
  check(s1.fit === "contain" && s1.duration_ms === null && s1.media_path === square.path, "round trip: slide 2 fields survive the console save");

  // 2. A half-filled second button is refused under that slide's field, and what was typed stays.
  await page.goto(`${BASE}/admin/sliders/${heroId}`, { waitUntil: "load", timeout: 120000 });
  await page.getByLabel("Second button URL", { exact: true }).nth(1).fill("/contact");
  await page.getByRole("button", { name: "Save slider" }).click();
  const slideTwo = page.locator("ol > li").nth(1);
  await slideTwo.getByText(/link2.?label/i).waitFor({ timeout: 30000 }).catch(() => {});
  check((await slideTwo.getByText(/link2.?label/i).count()) > 0, "422: the error appears inside the slide it names");
  check((await page.locator("ol > li").nth(0).getByText(/link2.?label/i).count()) === 0, "422: ... and not under slide 1");
  check((await val("Second button URL", 1)) === "/contact", "422: the typed address is kept");

  // 3. Phone: only the phone picture is requested for slide 1 (dots, so the thumbnail strip does not draw the wide one).
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phoneCtx.addCookies(await context.cookies());
  const phonePage = await phoneCtx.newPage();
  const requested = [];
  phonePage.on("request", (r) => { if (r.url().includes("/_next/image") || r.url().includes("/storage/")) requested.push(decodeURIComponent(r.url())); });
  await phonePage.goto(PREVIEW, { waitUntil: "load", timeout: 120000 });
  await phonePage.waitForLoadState("networkidle").catch(() => {});
  await sleep(1500);
  const sawPhone = requested.some((u) => u.includes(base(phone.path)));
  const sawWide = requested.some((u) => u.includes(base(wide.path)));
  check(sawPhone && !sawWide, "390px: slide 1 downloads the phone picture only", `phone=${sawPhone} wide=${sawWide} of ${requested.length} image requests`);
  await phoneCtx.close();

  // 4. Switch the slider to a slow zoom and thumbnails through the console itself.
  await page.goto(`${BASE}/admin/sliders/${heroId}`, { waitUntil: "load", timeout: 120000 });
  await page.selectOption("#media_effect", "zoom_in");
  await page.selectOption("#navigation", "thumbnails");
  await page.getByLabel("Kicker", { exact: true }).nth(0).fill("Probe kicker");
  await page.getByLabel("Show for (seconds)", { exact: true }).nth(1).fill("9");
  await page.getByRole("button", { name: "Save slider" }).click();
  await page.waitForURL(/saved=1/, { timeout: 60000 });
  const saved = (await api(`/admin/sliders/${heroId}`)).data;
  check(saved.media_effect === "zoom_in" && saved.navigation === "thumbnails" && saved.slides[0].kicker === "Probe kicker" && saved.slides[1].duration_ms === 9000,
    "console: Picture motion, Navigation, Kicker and Show-for are saved", `${saved.media_effect}/${saved.navigation}/${saved.slides[0].kicker}/${saved.slides[1].duration_ms}`);

  // 5. Desktop: timing, zoom, thumbnails, strip position, whole-picture fit.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await desk.addCookies(await context.cookies());
  const dp = await desk.newPage();
  await dp.goto(PREVIEW, { waitUntil: "load", timeout: 120000 });
  await dp.waitForSelector('button[aria-label^="Slide "][aria-current]', { timeout: 60000 });
  await dp.evaluate(() => {
    const idx = () => [...document.querySelectorAll('button[aria-label^="Slide "][aria-current]')].findIndex((b) => b.getAttribute("aria-current") === "true");
    window.__log = [];
    let last = -1;
    setInterval(() => {
      const i = idx();
      const el = document.querySelector('[role="group"][aria-roledescription="slide"]:not([aria-hidden]) [data-media-effect]');
      const scale = el ? parseFloat(getComputedStyle(el).scale) : NaN;
      if (i !== last) { window.__log.push({ t: performance.now(), i, scale }); last = i; }
      window.__scales = (window.__scales ?? []).concat({ t: performance.now(), i, scale });
    }, 50);
  });
  await dp.mouse.move(2, 2);
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && (await dp.evaluate(() => window.__log.length)) < 4) await sleep(250);
  const log = await dp.evaluate(() => window.__log);
  const scales = await dp.evaluate(() => window.__scales);
  if (log.length >= 4) {
    const nine = log[2].t - log[1].t; const three = log[3].t - log[2].t;
    check(log[1].i === 1 && log[2].i === 0 && log[3].i === 1, "timing: slides 1 -> 2 -> 1 -> 2", log.map((l) => l.i).join(">"));
    check(Math.abs(nine - 9000) < 700, "timing: slide 2 stays about 9s", `${Math.round(nine)}ms`);
    check(Math.abs(three - 3000) < 700, "timing: slide 1 stays about 3s", `${Math.round(three)}ms`);
    const during = scales.filter((s) => s.i === 1 && s.t >= log[1].t && s.t < log[2].t && !Number.isNaN(s.scale));
    const early = during.find((s) => s.t - log[1].t > 600);
    const mid = during.find((s) => s.t - log[1].t > 4500);
    check(Boolean(early && mid) && mid.scale > early.scale + 0.01 && mid.scale < 1.13, "zoom: scale grows through slide 2", `${early?.scale} -> ${mid?.scale}`);
  } else {
    check(false, "timing: four changes within 40s", `saw ${log.map((l) => l.i).join(">")}`);
  }

  // Thumbnails switch slides, the strip sits under the picture, the square picture is shown whole.
  await dp.mouse.move(640, 300);
  const thumbs = dp.locator('button[aria-label^="Slide "][aria-current]');
  check((await thumbs.count()) === 2, "thumbnails: one per slide");
  await thumbs.nth(1).click();
  await sleep(1200);
  const cur = () => dp.evaluate(() => [...document.querySelectorAll('button[aria-label^="Slide "][aria-current]')].findIndex((b) => b.getAttribute("aria-current") === "true"));
  check((await cur()) === 1, "thumbnails: pressing the second shows slide 2");
  const geo = await dp.evaluate(() => {
    const stage = document.querySelector("[data-slider-stage]").getBoundingClientRect();
    const t = document.querySelector('button[aria-label^="Slide "][aria-current]').getBoundingClientRect();
    const img = document.querySelector('[role="group"][aria-roledescription="slide"]:not([aria-hidden]) img');
    const r = img?.getBoundingClientRect();
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    return {
      stageBottom: stage.bottom, thumbTop: t.top, fit: img && getComputedStyle(img).objectFit,
      contentW: img.naturalWidth * scale, boxW: r.width, scrolls: document.documentElement.scrollWidth - innerWidth,
    };
  });
  check(geo.thumbTop >= geo.stageBottom - 1, "thumbnails: the strip sits below the picture", `strip top ${Math.round(geo.thumbTop)} >= picture bottom ${Math.round(geo.stageBottom)}`);
  check(geo.fit === "contain" && geo.contentW < geo.boxW - 20, "fit: slide 2 is shown whole with bars either side", `object-fit ${geo.fit}, ${Math.round(geo.contentW)}px of ${Math.round(geo.boxW)}px`);
  check(geo.scrolls <= 0, "page does not scroll sideways");
  await thumbs.nth(0).click();
  await sleep(1200);
  check((await cur()) === 0, "thumbnails: pressing the first shows slide 1");
  await desk.close();

  // 6. Reduced motion: no zoom, and the slides stay put.
  const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await calm.addCookies(await context.cookies());
  const cp = await calm.newPage();
  await cp.goto(PREVIEW, { waitUntil: "load", timeout: 120000 });
  await cp.waitForSelector('button[aria-label^="Slide "][aria-current]', { timeout: 60000 });
  await sleep(4500);
  const calmState = await cp.evaluate(() => {
    const el = document.querySelector("[data-media-effect]");
    return {
      scale: el ? getComputedStyle(el).scale : "absent",
      index: [...document.querySelectorAll('button[aria-label^="Slide "][aria-current]')].findIndex((b) => b.getAttribute("aria-current") === "true"),
    };
  });
  check(calmState.scale === "absent" || calmState.scale === "none" || calmState.scale === "1", "reduced motion: no zoom", calmState.scale);
  check(calmState.index === 0, "reduced motion: slide 1 stays after 4.5s (it would have moved at 3s)");
  await calm.close();
} finally {
  // Put the hero back exactly as read, then save it once in the console to purge the website's cache.
  try {
    if (original) {
      await api(`/admin/sliders/${original.id}`, "PATCH", originalPayload);
      await consoleSave(original.id);
      console.log(`restored homepage-hero (${original.slides.length} slides)`);
    } else if (heroId) {
      await api(`/admin/sliders/${heroId}`, "DELETE", { confirm: true });
      console.log("removed the homepage-hero this run created");
    }
  } catch (e) {
    failures += 1;
    console.error(`FAILED to restore homepage-hero: ${e.message}`);
  }
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll hero feature checks passed.");
process.exit(failures ? 1 : 0);
