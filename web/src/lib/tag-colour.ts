/**
 * Which of the twelve `--color-tag-N` hues a slug lands on, 1–12.
 *
 * A hash of the slug, not a column and not a random draw: a colour picked per
 * visit would differ between the server's HTML and the browser's and would
 * change on every reload, and a tag that is blue on one page and green on the
 * next is two tags. Stable across renders, pages and visits; a rename does not
 * move it because the slug is what a rename leaves alone. Shared by the blog's
 * category chips and the shop's tags, so a word is the same colour wherever it
 * is drawn.
 *
 * The tokens are derived per theme in `lib/palette.ts` and checked by
 * `npm run themes`: `--color-tag-fill-N` under white text, `--color-tag-N` as
 * coloured text on a card.
 */
export function tagIndex(slug: string): number {
  let h = 7;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 12) + 1;
}
