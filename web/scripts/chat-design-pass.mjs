/**
 * Phase 17: the design pass for the assistant panel, measured rather than eyeballed.
 *
 * `npm run audit` and `audit:mobile` only ever see the panel **closed** — they
 * cannot drive a conversation, so the launcher was audited and the thing it
 * opens never was. This opens it with a seeded conversation loaded (long
 * product name, an unbroken 95-character part number, eighteen turns, a card,
 * sources and an action) and measures the same properties the other two do,
 * plus the ones specific to a panel: focus order, escape, reduced motion, and
 * whether the scroll region is reachable from a keyboard.
 *
 *   CHAT_TOKEN=<session_token> node scripts/chat-design-pass.mjs
 *
 * Throwaway-ish: it needs a seeded conversation, so it is not part of the
 * gates. Keep it for the next time the panel changes.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const TOKEN = process.env.CHAT_TOKEN;
const WIDTHS = [320, 360, 390, 414, 768, 1280, 1920];

if (!TOKEN) {
  console.error("Set CHAT_TOKEN to a seeded conversation's session_token.");
  process.exit(2);
}

const problems = [];
const note = (w, msg) => problems.push(`${String(w).padStart(4)}px  ${msg}`);

const browser = await chromium.launch();

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    reducedMotion: width === 1280 ? "reduce" : "no-preference",
  });

  await context.addCookies([
    { name: "tw_chat", value: TOKEN, domain: "localhost", path: "/", httpOnly: true },
    { name: "tw_scheme_site", value: width === 1920 ? "dark" : "light", domain: "localhost", path: "/" },
    { name: "tw_scheme_console", value: width === 1920 ? "dark" : "light", domain: "localhost", path: "/" },
  ]);

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 180000 });

  // `aria-controls`, not an aria-label: the launcher is named by an sr-only
  // span, which is right for a screen reader and invisible to an attribute
  // selector.
  const launcher = page.locator('button[aria-controls="chat-panel"]').first();

  if (!(await launcher.count())) {
    note(width, "no launcher found — is chatbot_enabled on?");
    await context.close();
    continue;
  }

  await launcher.click();

  /*
   * Wait for the conversation, not for a guess at how long it takes.
   *
   * Opening resumes through a Server Action and an API round trip, so a fixed
   * 600ms measured the empty panel and reported it clean at every width -- a
   * pass that proved the launcher opens something and nothing else. The
   * element count in CHAT_PASS_DEBUG is what gave it away: 21 elements is a
   * welcome screen, not a nineteen-turn conversation.
   */
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    () => (document.querySelector("#chat-panel")?.querySelectorAll("*").length ?? 0) > 40,
    { timeout: 30000 },
  ).catch(() => {});
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------- overflow
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
  });
  if (overflow.scrollWidth > overflow.clientWidth) {
    note(width, `page scrolls horizontally by ${overflow.scrollWidth - overflow.clientWidth}px with the panel open`);
  }

  const panel = page.locator('#chat-panel').first();
  if (!(await panel.count())) {
    note(width, "the panel did not open");
    await context.close();
    continue;
  }

  // ------------------------------------------- anything painting off the edge
  const escapes = await page.evaluate(() => {
    const out = [];
    const panel = document.querySelector('#chat-panel');
    if (!panel) return out;

    for (const el of panel.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > window.innerWidth + 1 || r.left < -1) {
        out.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} ` +
          `left=${Math.round(r.left)} right=${Math.round(r.right)} (viewport ${window.innerWidth})`);
      }
    }
    return out.slice(0, 5);
  });
  for (const e of escapes) note(width, `outside the viewport: ${e}`);

  // ----------------------------------------------------- text outside its box
  const textOverflow = await page.evaluate(() => {
    const out = [];
    const panel = document.querySelector('#chat-panel');
    if (!panel) return out;

    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;

      /*
       * Skip visually-hidden text. `sr-only` clips its box to a pixel, so a
       * Range over the words inside legitimately measures far wider than the
       * parent -- which is not overflow, it is the technique working. The
       * first run of this reported the Close, Send and textarea labels at
       * every width, three false positives that would have sent somebody
       * looking for a layout bug that is not there. `mobile-audit.mjs` skips
       * the same case with the same test.
       */
      const cs = getComputedStyle(n.parentElement);
      const parent = n.parentElement.getBoundingClientRect();
      if (cs.clipPath !== "none" && parent.width < 2) continue;
      if (parent.width <= 1 || parent.height <= 1) continue;

      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width && r.right > parent.right + 1) {
        out.push(`"${n.textContent.trim().slice(0, 40)}…" runs ${Math.round(r.right - parent.right)}px past its box`);
      }
    }
    return out.slice(0, 5);
  });
  for (const t of textOverflow) note(width, t);

  if (process.env.CHAT_PASS_DEBUG) {
    const counts = await page.evaluate(() => {
      const panel = document.querySelector("#chat-panel");
      const w = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      let text = 0;
      while (w.nextNode()) text += 1;
      return {
        elements: panel.querySelectorAll("*").length,
        controls: panel.querySelectorAll("button, a, input, textarea, select").length,
        messages: panel.querySelectorAll("li, [data-role]").length,
        text,
      };
    });
    console.log(`  ${width}px examined`, counts);
  }

  // -------------------------------------------------------------- tap targets
  const small = await page.evaluate(() => {
    const out = [];
    const panel = document.querySelector('#chat-panel');
    if (!panel) return out;

    for (const el of panel.querySelectorAll("button, a, input, textarea, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 24 || r.height < 24) {
        out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ` +
          `${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  for (const s of small) note(width, `tap target under 24px: ${s}`);

  // ------------------------------------------------- form controls under 16px
  const tiny = await page.evaluate(() => {
    const out = [];
    const panel = document.querySelector('#chat-panel');
    if (!panel) return out;
    for (const el of panel.querySelectorAll("input, textarea, select")) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) out.push(`${el.tagName.toLowerCase()} at ${size}px`);
    }
    return out;
  });
  if (width < 640) for (const t of tiny) note(width, `iOS will zoom: ${t}`);

  // ------------------------------------------------ the panel must not eat it
  const coverage = await page.evaluate(() => {
    const p = document.querySelector('#chat-panel');
    if (!p) return 0;
    const r = p.getBoundingClientRect();
    return (r.width * r.height) / (window.innerWidth * window.innerHeight);
  });
  if (coverage > 0.95 && width >= 768) {
    note(width, `the panel covers ${Math.round(coverage * 100)}% of a large viewport`);
  }

  // ------------------------------------------------------- keyboard and focus
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    const panel = document.querySelector('#chat-panel');
    return {
      inPanel: !!(panel && a && panel.contains(a)),
      tag: a ? a.tagName.toLowerCase() : "none",
    };
  });
  if (!focused.inPanel) note(width, `focus did not move into the panel (it is on <${focused.tag}>)`);

  // The scroll region has to be reachable by keyboard, or a long conversation
  // is unreadable without a mouse.
  const scroller = await page.evaluate(() => {
    const panel = document.querySelector('#chat-panel');
    if (!panel) return null;
    for (const el of panel.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4) {
        return { tabIndex: el.tabIndex, role: el.getAttribute("role"), label: el.getAttribute("aria-label") };
      }
    }
    return null;
  });
  if (scroller && scroller.tabIndex < 0) {
    note(width, "the message list scrolls but cannot be focused, so a keyboard cannot scroll it");
  }

  // Escape must close it.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const stillOpen = await page.evaluate(() => {
    const p = document.querySelector('#chat-panel');
    if (!p) return false;
    const s = getComputedStyle(p);
    return s.visibility === "visible" && s.display !== "none";
  });
  if (stillOpen) note(width, "Escape did not close the panel");

  await context.close();
}

await browser.close();

console.log("");
if (problems.length === 0) {
  console.log(`The panel is clean at ${WIDTHS.join(", ")}px.`);
} else {
  console.log(`${problems.length} problem(s):\n`);
  for (const p of problems) console.log("  " + p);
  process.exitCode = 1;
}
