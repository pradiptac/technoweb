/**
 * WordPress-style shortcodes inside CMS bodies: [slider slug="hero"],
 * [gallery slug="recent-work"], [form slug="contact"] — and, since
 * 2026-09-24, the content blocks: [cta …], [stats …], [pricing …],
 * [stack …].
 *
 * Why this is safe, and what would make it unsafe:
 *
 * A shortcode is plain text, so `HtmlSanitiser` on the API side neither strips
 * nor escapes it — it is not markup and has no attributes to filter. The
 * parser below splits the *already sanitised* HTML into segments and never
 * concatenates anything back into it. Each shortcode becomes a React element
 * rendered between two `dangerouslySetInnerHTML` fragments, so the value of
 * `slug` reaches the DOM as a prop, not as markup, and React escapes it.
 *
 * The rule that keeps that true: **never turn a shortcode into an HTML string**.
 * The moment one is expanded by string substitution — `html.replace(tag,
 * '<div data-slug="' + slug + '">')` — an editor typing `"><script>` owns
 * every page that embeds it, and the sanitiser has already run so nothing is
 * left to catch it.
 *
 * The attribute value is additionally restricted to slug characters, so a
 * malformed shortcode fails to match and renders as the literal text the
 * editor typed rather than as a component with a surprising argument.
 */

export type Segment =
  | { type: "html"; html: string }
  | { type: "slider"; slug: string }
  | { type: "gallery"; slug: string }
  | { type: "form"; slug: string }
  | { type: BlockKind; slug: string };

/** The content-block shortcodes; each names its block's type, and a slug of another type renders nothing. */
export type BlockKind = "cta" | "stats" | "pricing" | "stack";

/** Everything the parser recognises, so a caller cannot ask for a fifth. */
export type ShortcodeKind = "slider" | "gallery" | "form" | BlockKind;

/**
 * [slider slug="hero"], [gallery slug="work"] and [form slug="contact"] —
 * either quote, any spacing.
 *
 * One pattern for all three so a body cannot be parsed three times and cannot
 * end up with one kind expanded and another left as literal text. The slug is restricted
 * to slug characters, so a malformed shortcode fails to match and renders as
 * the text the editor typed rather than as a component with a surprising
 * argument.
 */
const SHORTCODE = /\[(slider|gallery|form|cta|stats|pricing|stack)\s+slug=["']([a-z0-9-]+)["']\s*\]/gi;

/**
 * Splits a body into HTML runs and the shortcodes between them.
 *
 * A body with no shortcode returns a single html segment, which is the common
 * case and costs one regex test.
 */
export function parseShortcodes(html: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  // A fresh regex per call: /g carries lastIndex between calls and a shared
  // instance would skip matches on every other body it was given.
  const pattern = new RegExp(SHORTCODE.source, "gi");

  for (let m = pattern.exec(html); m !== null; m = pattern.exec(html)) {
    if (m.index > last) segments.push({ type: "html", html: html.slice(last, m.index) });
    segments.push({
      type: m[1].toLowerCase() as ShortcodeKind,
      slug: m[2].toLowerCase(),
    });
    last = m.index + m[0].length;
  }

  if (last < html.length) segments.push({ type: "html", html: html.slice(last) });

  return segments.length ? segments : [{ type: "html", html }];
}

/** Every distinct slug a body references, per kind, for one fetch each. */
export function slugsIn(html: string, kind: ShortcodeKind): string[] {
  return [...new Set(
    parseShortcodes(html)
      .filter((s) => s.type === kind)
      .map((s) => (s as { slug: string }).slug),
  )];
}

/**
 * `[icon name="ms:router"]` inside a paragraph, as an inline svg (0.179.0,
 * docs/editor.md "Icons in text").
 *
 * **The one shortcode expanded by substitution.** The rule above — a shortcode
 * becomes a component, never markup — exists because the sanitiser has
 * already run, so anything written in afterwards is trusted. An icon has to
 * sit *inside* a sentence, where the segment splitter cannot reach without
 * parsing HTML. So the substitution is allowed on one condition, held by the
 * pattern: the only thing written into the markup is a name made of
 * `[a-z0-9_]`, at most 37 characters. No quote, bracket, ampersand or space
 * can come out of that, so it cannot leave the attribute it is written
 * into, and whatever else a malformed shortcode contains stays literal text.
 * `shortcodes.check.mjs` pins both halves.
 *
 * Quotes may arrive entity-encoded from the editor. Only Google icons are
 * offered here: a site icon is a component with no file to point at.
 */
const INLINE_ICON = /\[icon\s+name=(?:"|'|&quot;)ms:([a-z0-9_]{1,37})(?:"|'|&quot;)\s*\]/g;

export function expandInlineIcons(html: string): string {
  return html.includes("[icon")
    ? html.replace(INLINE_ICON, (_match, name: string) =>
      `<svg class="prose-icon" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><use href="/icons/material/${name}.svg#i"/></svg>`)
    : html;
}
