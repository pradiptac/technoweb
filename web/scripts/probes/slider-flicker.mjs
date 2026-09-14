/**
 * Film one slider transition frame by frame and say whether anything flickered.
 *
 * Uses the DevTools screencast, which hands over every compositor frame, so
 * a 700ms crossfade is 30–40 samples rather than the one a `page.screenshot`
 * round trip allows. For each frame: the slider box's mean luminance, and
 * beside it a DOM sample — how many <img>s are in the box, which have decoded
 * (`complete` + naturalWidth) and their computed opacity. A crossfade between
 * two decoded photographs moves the luminance smoothly from one value to the
 * other; a dip towards the dark backdrop, or an undecoded <img> at opacity 1,
 * is the flicker, whatever it looked like to the eye.
 *
 *   node scripts/probes/slider-flicker.mjs /store
 *   node scripts/probes/slider-flicker.mjs / --clicks=3
 */
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const route = process.argv[2] ?? "/store";
const clicks = Number((process.argv.find((a) => a.startsWith("--clicks=")) ?? "--clicks=2").split("=")[1]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE + route, { waitUntil: "load" });

const slider = page.locator('[aria-roledescription="carousel"]').first();
await slider.scrollIntoViewIfNeeded();
await page.waitForTimeout(3000);
const box = await slider.boundingBox();
if (!box) throw new Error("no slider on " + route);
console.log(`${route}: slider ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.x)},${Math.round(box.y)}`);

const cdp = await page.context().newCDPSession(page);
let frames = [];
let recording = false;
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (!recording) return;
  frames.push({ t: metadata.timestamp * 1000, buf: Buffer.from(data, "base64"), meta: metadata });
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });

const luminance = async (buf) => {
  const img = sharp(buf);
  const { width } = await img.metadata();
  // The screencast frame is the viewport; the box is viewport-relative
  // (boundingBox), so only the frame's own scale matters.
  const scale = width / 1440;
  const left = Math.max(0, Math.round(box.x * scale));
  const top = Math.max(0, Math.round(box.y * scale));
  const { data, info } = await img
    .extract({ left, top, width: Math.round(box.width * scale), height: Math.round(box.height * scale) })
    .resize(64, 24, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / info.channels);
};

const dom = () => slider.evaluate((el) => {
  const imgs = [...el.querySelectorAll("img")];
  return {
    t: performance.now(),
    imgs: imgs.map((img) => ({
      decoded: img.complete && img.naturalWidth > 0,
      // A neighbour is mounted `invisible` to decode early; it is not on screen.
      opacity: getComputedStyle(img).visibility === "hidden" ? "0.00" : Number(getComputedStyle(img).opacity).toFixed(2),
      anim: getComputedStyle(img).animationName.replace("slide-", ""),
      id: img.currentSrc.replace(/.*%2F/, "").replace(/\.\w+.*/, "").slice(0, 8),
    })),
  };
});

for (let c = 1; c <= clicks; c++) {
  frames = [];
  recording = true;
  const domSamples = [];
  const clickAt = Date.now();
  const btn = slider.getByRole("button", { name: "Next slide" });
  await btn.click({ force: true });
  while (Date.now() - clickAt < 1300) {
    domSamples.push({ t: Date.now() - clickAt, ...(await dom()) });
  }
  recording = false;
  await page.waitForTimeout(200);

  const lums = [];
  for (const f of frames) lums.push({ t: f.t, l: await luminance(f.buf) });
  if (process.env.DUMP) {
    const fs = await import("node:fs");
    const base0 = frames[0]?.t ?? 0;
    for (const f of frames) {
      const { width } = await sharp(f.buf).metadata();
      const scale = width / 1440;
      await sharp(f.buf).extract({ left: Math.round(box.x * scale), top: Math.round(box.y * scale), width: Math.round(box.width * scale), height: Math.round(box.height * scale) })
        .jpeg({ quality: 80 }).toFile(`${process.env.DUMP}/c${c}-${String(Math.round(f.t - base0)).padStart(4, "0")}.jpg`);
    }
    fs.writeFileSync(`${process.env.DUMP}/c${c}-dom.json`, JSON.stringify(domSamples.slice(0, 20), null, 1));
  }
  const base = lums[0]?.t ?? 0;
  console.log(`\nclick ${c}: ${lums.length} frames`);
  let worstDrop = { drop: 0 };
  let prev = null;
  const line = [];
  for (const f of lums) {
    const rel = Math.round(f.t - base);
    line.push(`${rel}:${f.l.toFixed(0)}`);
    if (prev && prev.l - f.l > worstDrop.drop) worstDrop = { drop: prev.l - f.l, at: rel };
    prev = f;
  }
  console.log("  lum by ms: " + line.join(" "));
  const first = lums[0]?.l ?? 0, last = lums.at(-1)?.l ?? 0;
  const minL = Math.min(...lums.map((f) => f.l)), maxL = Math.max(...lums.map((f) => f.l));
  console.log(`  start ${first.toFixed(1)} end ${last.toFixed(1)}; min ${minL.toFixed(1)} max ${maxL.toFixed(1)}; worst frame drop ${worstDrop.drop.toFixed(1)} at ${worstDrop.at}ms`);
  const overshoot = Math.min(first, last) - minL;
  console.log(`  ${overshoot > 3 ? "DIP" : "no dip"}: lowest frame is ${overshoot.toFixed(1)} below both endpoints`);

  const bad = domSamples.filter((s) => s.imgs.some((i) => !i.decoded && Number(i.opacity) > 0));
  console.log(`  DOM: ${domSamples.length} samples; ${bad.length} with an undecoded <img> visible`);
  for (const s of domSamples.filter((_, i) => i % Math.ceil(domSamples.length / 12) === 0)) {
    console.log(`    ${String(s.t).padStart(4)}ms imgs=${s.imgs.length} ${s.imgs.map((i) => `${i.id}${i.decoded ? "✓" : "✗"}@${i.opacity}${i.anim !== "none" ? ":" + i.anim : ""}`).join("  ")}`);
  }
  await page.waitForTimeout(1000);
}

await cdp.send("Page.stopScreencast");
await browser.close();
