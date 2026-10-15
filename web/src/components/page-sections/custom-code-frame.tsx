"use client";

import { useEffect, useRef, useState } from "react";
import { revive } from "@/components/layout/custom-code";

/**
 * Custom code, drawn (0.158.0, `docs/page-builder.md` "Custom code").
 *
 * **`CodeFrame` is the default and the safe one.** The code is stored raw, and
 * the console and the public site are one origin: script on the page itself
 * would act as whoever is viewing it — an administrator included. So it runs in
 * a frame whose `sandbox` has `allow-scripts` and **no `allow-same-origin`**:
 * the document gets an opaque origin, with no access to this page's cookies,
 * storage or DOM, and its `fetch` to the API is a cross-origin request without
 * credentials. `allow-popups` and `allow-forms` let a widget open a link or post
 * a form; `allow-top-navigation` is absent, so it cannot send the page away.
 *
 * A frame cannot size itself, so the document carries a few lines that post
 * its height to the parent. The listener below answers **only the message whose
 * `source` is this frame's own `contentWindow`** — a sandboxed frame's origin is
 * the string "null", so the origin proves nothing and the source is the check —
 * and clamps the number, so a frame can make itself neither invisible nor a
 * wall. The srcdoc inherits the site's Content-Security-Policy (the Report-Only
 * half reports what it loads; nothing is blocked).
 *
 * **`PageCode` is the administrator's choice** (`mode: "page"`): the markup goes
 * into the page itself, its scripts rebuilt so they run — the `body_code`
 * setting's mechanism, with the same trust.
 */
const START = { auto: 160, s: 160, m: 320, l: 560 } as const;
const MIN = 40;
const MAX = 4000;
const SANDBOX = "allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox";

/**
 * Posts the document's height to the parent when it changes, and again when the
 * parent asks (`MEASURE`): a server-rendered frame loads before React hydrates,
 * so its first reports reach a page with no listener yet and are lost.
 */
const MEASURE = "twCodeMeasure";
const REPORT = "(function(){var d=document,l=0;function s(){try{var h=Math.ceil(Math.max(d.body?d.body.scrollHeight:0,d.documentElement.offsetHeight));if(h!==l){l=h;parent.postMessage({twCodeHeight:h},'*')}}catch(e){}}"
  + "addEventListener('message',function(e){if(e.source===parent&&e.data==='" + MEASURE + "'){l=0;s()}});"
  + "addEventListener('load',s);if(window.ResizeObserver){new ResizeObserver(s).observe(d.documentElement)}else{setInterval(s,500)}s()})();";

/** The pasted code in a minimal document. Links open in a new tab; the reporter runs first so a widget that throws still sizes. */
export function srcdocFor(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">`
    + `<style>html,body{margin:0}body{overflow-wrap:anywhere}</style><script>${REPORT}</script></head><body>${html}</body></html>`;
}

export function CodeFrame({ html, label, height }: { html: string; label: string; height?: keyof typeof START }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState<number>(START[height ?? "auto"]);
  // Only a constant word goes to the frame, so "*" (its origin is "null") gives nothing away.
  const ask = () => ref.current?.contentWindow?.postMessage(MEASURE, "*");

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const sent = (e.data as { twCodeHeight?: unknown } | null)?.twCodeHeight;
      if (typeof sent === "number" && Number.isFinite(sent)) setH(Math.min(MAX, Math.max(MIN, Math.ceil(sent))));
    };
    window.addEventListener("message", onMessage);
    ask();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      title={label}
      srcDoc={srcdocFor(html)}
      sandbox={SANDBOX}
      loading="lazy"
      onLoad={ask}
      data-custom-code-frame
      className="block w-full min-w-0 max-w-full border-0"
      style={{ height: h }}
    />
  );
}

/** Code put into the page itself — administrators only (`CustomCodeGuard`). Filled after mount, like `body_code`. */
export function PageCode({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const node of Array.from(template.content.childNodes)) host.appendChild(revive(node));
    return () => { host.replaceChildren(); };
  }, [html]);

  return <div ref={ref} data-custom-code-page className="min-w-0 max-w-full" />;
}
