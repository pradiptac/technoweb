/**
 * Anchors for an article's sections, from its sanitised body.
 *
 * Long posts and knowledge articles are `Prose` from top to bottom with no
 * way to jump. This stamps an `id` on every `h2` and `h3` in the HTML and
 * hands back the list, so `ArticleMap` can draw "On this page" and the
 * progress bar can know the sections. The body has already been through
 * `HtmlSanitiser` on write — headings here are `<h2>`/`<h3>` with inline
 * markup at most, which is what the regex assumes and why a parser is not
 * needed. An `h1` is refused by the sanitiser, so it never appears.
 *
 * Ids are slugs of the heading text, made unique with a counter, and an
 * existing `id` on a heading is kept — an editor may have written one to
 * link to from elsewhere.
 */
export type Heading = { id: string; text: string; level: 2 | 3 };

export function withHeadingIds(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  const out = html.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (whole, level: string, attrs = "", inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text) return whole;

    const existing = /\sid="([^"]+)"/i.exec(attrs)?.[1];
    let id = existing ?? (text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section");
    if (!existing) {
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n + 1}`;
    }

    headings.push({ id, text, level: level === "2" ? 2 : 3 });
    const rest = existing ? attrs : `${attrs} id="${id}"`;
    return `<h${level}${rest}>${inner}</h${level}>`;
  });

  return { html: out, headings };
}
