/**
 * The raw-HTML snippet, posted from a genuinely different origin.
 *
 *   node scripts/probes/embed-html.mjs
 *
 * This is the half that cannot be reasoned about. A cross-origin `fetch` is
 * *sent* whether or not CORS allows it — the browser blocks the caller from
 * reading the reply, not the request from arriving — so a missing
 * `Access-Control-Allow-Origin` looks exactly like a working form that always
 * errors, with the lead created every time. The only way to know which
 * happened is to submit from another origin and then count the leads.
 *
 * It takes the snippet the console generates, from the same module the console
 * imports, so what is exercised here is what an editor actually copies rather
 * than a hand-written approximation of it.
 */

import { createServer } from "node:http";
import { chromium } from "playwright";
import { buildHtmlSnippet } from "../../src/app/admin/(app)/forms/embed-html.ts";

const BASE = process.env.BASE ?? "http://localhost:3000";
const HOST_PORT = 4556;

const res = await fetch(`${BASE.replace("3000", "3000")}/api/embed/forms/contact`, { method: "OPTIONS" });
const preflight = {
  status: res.status,
  allowOrigin: res.headers.get("access-control-allow-origin"),
  allowCredentials: res.headers.get("access-control-allow-credentials"),
};

// The form definition, straight from the public endpoint the console reads.
const form = await fetch(`${BASE}/api/embed/forms/contact`, { method: "POST", body: new FormData() })
  .then((r) => r.status)
  .catch(() => 0);

const api = process.env.API_BASE_URL ?? "http://localhost:8000";
const definition = await fetch(`${api}/api/v1/forms/contact`).then((r) => r.json()).then((r) => r.data);

const snippet = buildHtmlSnippet(definition, "contact", BASE);

const stamp = `html-probe-${Date.now()}`;
const page = `<!doctype html><meta charset="utf-8"><title>Partner site</title>
<h1>A completely different website</h1>
${snippet}
<script>
  // Pre-fill so the probe only has to press the button.
  document.querySelector('[name="name"]').value = "HTML Probe";
  document.querySelector('[name="email"]').value = "html-probe@example.test";
  var t = document.querySelector('textarea'); if (t) t.value = ${JSON.stringify(stamp)};
  var p = document.querySelector('[name="phone"]'); if (p) p.value = "9830000001";
  var c = document.querySelector('[name="company"]'); if (c) c.value = "Probe Ltd";
  var s = document.querySelector('select'); if (s && s.options.length > 1) s.selectedIndex = 1;
</script>`;

const site = createServer((_req, res2) => {
  res2.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res2.end(page);
}).listen(HOST_PORT);

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const errors = [];
tab.on("pageerror", (e) => errors.push(String(e)));
tab.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await tab.goto(`http://127.0.0.1:${HOST_PORT}/`, { waitUntil: "networkidle", timeout: 120000 });

const fields = await tab.locator("form input, form textarea, form select").count();
const labelled = await tab.evaluate(() =>
  [...document.querySelectorAll("form input:not([type=hidden]), form textarea, form select")]
    .every((el) => el.id && document.querySelector(`label[for="${el.id}"]`)));
const honeypot = await tab.locator('input[name="website"]').count();

await tab.locator('button[type="submit"]').click();

/*
 * Poll rather than sleep. The round trip is browser -> our route handler ->
 * Laravel -> back, on a dev server, and a fixed wait that happens to be too
 * short reports "Sending..." — which reads as a form that hangs when what it
 * actually was is a probe that did not wait. This project has made that exact
 * mistake before, on the chat panel and on the email-template preview.
 */
await tab.locator('[data-tw-status]').filter({ hasNotText: "Sending" })
  .first().waitFor({ timeout: 60000 }).catch(() => {});

const status = (await tab.locator("[data-tw-status]").innerText()).trim();
const corsBlocked = errors.filter((e) => /CORS|Access-Control/i.test(e));

site.close();
await browser.close();

const lines = [
  `preflight            status ${preflight.status}, allow-origin ${preflight.allowOrigin}, allow-credentials ${preflight.allowCredentials ?? "(absent)"}`,
  `POST with no fields  status ${form} (422 expected — the API validating, not CORS failing)`,
  `controls generated   ${fields}`,
  `every control has a <label for>   ${labelled}`,
  `honeypot present     ${honeypot === 1}`,
  `CORS errors in console            ${corsBlocked.length === 0 ? "none" : corsBlocked[0]}`,
  `status line after submit          "${status}"`,
  `STAMP=${stamp}`,
];

console.log(lines.join("\n"));
