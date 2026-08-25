/**
 * WordPress-style shortcodes inside CMS bodies: [slider slug="hero"].
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
  | { type: "slider"; slug: string };

/** [slider slug="hero"] — single or double quotes, any spacing. */
const SHORTCODE = /\[slider\s+slug=["']([a-z0-9-]+)["']\s*\]/gi;

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
    segments.push({ type: "slider", slug: m[1].toLowerCase() });
    last = m.index + m[0].length;
  }

  if (last < html.length) segments.push({ type: "html", html: html.slice(last) });

  return segments.length ? segments : [{ type: "html", html }];
}

/** Every distinct slider a body references, for one fetch per slug. */
export function sliderSlugsIn(html: string): string[] {
  return [...new Set(
    parseShortcodes(html)
      .filter((s): s is Extract<Segment, { type: "slider" }> => s.type === "slider")
      .map((s) => s.slug),
  )];
}
