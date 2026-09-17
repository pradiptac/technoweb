/**
 * The mega menu's switch between two hosts — `node scripts/probes/menu-switch.mjs`.
 *
 * Measures the rule in docs/site-chrome.md: with the pointer moved from
 * the first panel host to the second, the panel being left reports a
 * transition-duration of `0s` (the `panel-drop` rule) while the neighbour
 * arrives over `--duration-fast`; leaving the nav altogether keeps the
 * 140ms fade. Two panels fading over each other was the "flicker" the
 * client saw on 2026-09-17. `BASE` from scripts/shared.mjs.
 */
import { BASE } from "../shared.mjs";
import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
const items = await p.$$('nav[aria-label="Primary"] li.group');
const b1 = await items[0].boundingBox(); const b2 = await items[1].boundingBox();
await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await p.waitForTimeout(400);
await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
console.log(await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Primary"] li.group')].slice(0, 2).map(li => { const cs = getComputedStyle(li.querySelector('.top-full')); return { dur: cs.transitionDuration, vis: cs.visibility, op: cs.opacity }; })));
await p.mouse.move(b2.x, b2.y + 500); await p.waitForTimeout(20);
console.log("leaving:", await p.evaluate(() => { const cs = getComputedStyle(document.querySelectorAll('nav[aria-label="Primary"] li.group')[1].querySelector('.top-full')); return { dur: cs.transitionDuration, vis: cs.visibility, op: cs.opacity }; }));
await b.close();
