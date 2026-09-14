import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 800 } });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await p.click('button[aria-label="Open menu"]');
await p.waitForTimeout(500);
const a1 = await p.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
const inert = await p.evaluate(() => document.getElementById("mobile-menu")?.hasAttribute("inert"));
const overflow = await p.evaluate(() => document.body.style.overflow);
// tab around: from close button, shift+tab should wrap to last focusable inside the panel
await p.keyboard.press("Shift+Tab");
const inside = await p.evaluate(() => document.getElementById("mobile-menu")?.contains(document.activeElement));
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
const a2 = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"));
const inert2 = await p.evaluate(() => document.getElementById("mobile-menu")?.hasAttribute("inert"));
const overflow2 = await p.evaluate(() => document.body.style.overflow);
console.log(JSON.stringify({ focusOnOpen: a1, inertWhileOpen: inert, bodyLocked: overflow, shiftTabStaysInside: inside, focusAfterEscape: a2, inertAfterClose: inert2, bodyAfter: overflow2 }));
await b.close();
