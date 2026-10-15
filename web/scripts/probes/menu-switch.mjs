/**
 * Every dropdown fades in — `node scripts/probes/menu-switch.mjs`.
 *
 * Measures the rule in docs/site-chrome.md (the client, 2026-09-27): a panel
 * arrives by fading in over `--duration-menu`, a first open and a move from
 * one host to the next alike, and the panel being left is gone at once when
 * another host is hovered, so a swap is never two panels fading over each
 * other. A panel simply left — the pointer off the menu altogether — fades
 * out over `--duration-menu-exit`. Both figures are read from the page's own
 * tokens, so changing a token cannot leave this probe asserting the old one. Read from the running transitions (`getAnimations()`) just after
 * the pointer lands — a timed opacity sample is only as fine as a round trip
 * to the page, which against the dev server is coarser than the fade.
 * Covers the primary nav and the first visible utility-bar panel (the
 * Customer zone menu) under whatever theme the site is on. `BASE` from
 * scripts/shared.mjs.
 */
import { BASE } from "../shared.mjs";
import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/`, { waitUntil: "load" });
await p.waitForTimeout(1500);

/** The panel's opacity and its running opacity transition, if any. */
const read = (host) => host.evaluate((el) => {
  const panel = el.querySelector(".panel-drop");
  const fade = panel?.getAnimations().find((a) => a.transitionProperty === "opacity");
  return { opacity: panel ? Number(getComputedStyle(panel).opacity).toFixed(2) : null, fade: fade ? fade.effect.getTiming().duration : null };
});

const visible = async (list) => {
  const out = [];
  for (const h of list) if (await h.boundingBox()) out.push(h);
  return out;
};

/** A duration token as milliseconds, read from the page. */
const token = (name) => p.evaluate((n) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
}, name);
const IN = await token("--duration-menu");
const OUT = await token("--duration-menu-exit");
console.log(`tokens        in ${IN}ms, out ${OUT}ms`);

let ok = IN >= 300 && OUT >= 200 && OUT < IN;
const hosts = await visible(await p.$$("nav [data-panel-host]"));

if (hosts.length >= 2) {
  const [b1, b2] = [await hosts[0].boundingBox(), await hosts[1].boundingBox()];
  await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  const first = await read(hosts[0]);
  await p.waitForTimeout(400);
  await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  const entered = await read(hosts[1]);
  const left = await read(hosts[0]);

  console.log("first open   ", first);
  console.log("swap, entered", entered);
  console.log("swap, left   ", left);
  ok &&= first.fade === IN && entered.fade === IN && left.fade === null && left.opacity === "0.00";

  // Off the menu altogether: the open panel fades out, at the exit timing.
  await p.waitForTimeout(500);
  await p.mouse.move(700, 800);
  const leaving = await read(hosts[1]);
  console.log("left the menu", leaving);
  ok &&= leaving.fade === OUT;
} else {
  console.log("fewer than two visible panel hosts in a <nav> on this theme");
}

const utility = await visible(await p.$$("[data-panel-host]"));
const outside = [];
// Outside the nav, and actually holding a panel: a utility link with nothing
// under it is a host too, and the first one on an install may be just that.
for (const h of utility) if (await h.evaluate((el) => !el.closest("nav") && Boolean(el.querySelector(".panel-drop")))) outside.push(h);

if (outside.length) {
  await p.mouse.move(700, 800);
  await p.waitForTimeout(400);
  const u = await outside[0].boundingBox();
  await p.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
  const bar = await read(outside[0]);
  console.log("utility bar  ", bar);
  ok &&= bar.fade === IN;
}

console.log(ok ? "PASS: every panel fades in; the one left goes at once" : "FAIL");
await b.close();
process.exit(ok ? 0 : 1);
