"use client";

import { useEffect } from "react";

/**
 * The code an administrator pasted into Settings → Embeds → "Before
 * `</body>`", put on the public site's pages.
 *
 * Asked for on 2026-09-17: a box for the snippet a widget vendor says to
 * paste "before the closing `</body>` tag" — a chat, a booking tool, a
 * badge. It is inserted at the end of `<body>` on mount, and inserted as
 * *nodes*, not as `innerHTML`: a `<script>` that arrives through
 * `innerHTML` never runs, by specification, so each one is rebuilt with
 * `document.createElement` and the same attributes and text, which is
 * what makes a pasted snippet do what its vendor's instructions say.
 * Everything else in the snippet goes in as it was parsed.
 *
 * **This is raw markup on every public page, on purpose, and only an
 * administrator can write it** (`role:admin` on the settings endpoint; the
 * `embeds` group is public so the site can read it, like `analytics`).
 * It bypasses the sanitiser by design — sanitised, it could not carry a
 * script, and carrying a script is the whole of what it is for — so it is
 * exactly as trusted as the administrator's password, the same footing as
 * the GA and Meta ids. It is mounted once, in the marketing layout: the
 * console and the portal never carry it, for the reason `Analytics` is
 * kept out of them. Under the report-only CSP a pasted script from a host
 * the policy does not name is *reported* and still runs; when that policy
 * is promoted, the vendor's host has to be added to `next.config.ts`.
 */
export function CustomCode({ html }: { html: string }) {
  useEffect(() => {
    const trimmed = html.trim();
    if (!trimmed) return;
    const host = document.createElement("div");
    host.setAttribute("data-custom-code", "");
    const template = document.createElement("template");
    template.innerHTML = trimmed;
    for (const node of Array.from(template.content.childNodes)) host.appendChild(revive(node));
    document.body.appendChild(host);
    return () => { host.remove(); };
  }, [html]);

  return null;
}

/** A `<script>` parsed from markup is inert; a fresh one with the same attributes and text runs. */
function revive(node: Node): Node {
  if (node instanceof HTMLScriptElement) {
    const script = document.createElement("script");
    for (const { name, value } of Array.from(node.attributes)) script.setAttribute(name, value);
    script.text = node.text;
    return script;
  }
  if (node instanceof Element) {
    for (const child of Array.from(node.childNodes)) {
      const revived = revive(child);
      if (revived !== child) node.replaceChild(revived, child);
    }
  }
  return node;
}
