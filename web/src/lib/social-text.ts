/**
 * X's length rule for a social post, the same arithmetic as the API's
 * `App\Support\Social\SocialText` (C7). Pure, so the review panel can count as
 * the editor types and `scripts/social-text.check.mjs` can pin it.
 *
 * X counts every link as 23 characters whatever its length, and the site
 * appends a space and the record's link to the text, so what must fit in 280
 * is the text's own count plus 1 + 23. Characters are code points, as PHP's
 * `mb_strlen` counts them.
 */
export const X_LIMIT = 280;
export const X_URL = 23;

/** The text's own length with each link counted as 23. */
export function xLength(text: string): number {
  let links = 0;
  const bare = text.replace(/https?:\/\/\S+/gu, () => { links++; return ""; });

  return Array.from(bare).length + links * X_URL;
}

/** What X will count once the site has appended a space and the link. */
export function xTotal(text: string): number {
  return xLength(text) + 1 + X_URL;
}

export function xFits(text: string, url = "https://x"): boolean {
  return xLength(text) + (url === "" ? 0 : 1 + X_URL) <= X_LIMIT;
}
