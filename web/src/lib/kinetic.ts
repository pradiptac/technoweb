/**
 * A hero heading's effect (0.171.0, docs/motion.md "Kinetic headings").
 *
 * Pure and directive-less: the server components that resolve it and the
 * island that plays it (`components/ui/kinetic-text.tsx`) both import it.
 * The list shown to editors is `KINETIC` in motion-choices.ts; the API
 * checks only an id's shape, so anything this file does not know is `none`.
 */
export type KineticEffect = "none" | "rotate" | "type" | "decode" | "highlight";

const EFFECTS: KineticEffect[] = ["none", "rotate", "type", "decode", "highlight"];
const SITE_EFFECTS: KineticEffect[] = ["none", "type", "decode", "highlight"];

/** One alternative per line, trimmed, blanks dropped, at most six. */
export function kineticWords(raw: string | null | undefined): string[] {
  return (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
}

/**
 * `default` or blank follows the site's choice; an unknown id is `none`;
 * rotating words without words is `none` — and the site-wide choice can
 * never be `rotate`, which needs a list only a hero can carry.
 */
export function kineticFor(
  siteDefault: string | undefined,
  override: string | null | undefined,
  words: string | null | undefined,
): { effect: KineticEffect; words: string[] } {
  const list = kineticWords(words);
  const site = SITE_EFFECTS.includes(siteDefault as KineticEffect) ? (siteDefault as KineticEffect) : "none";
  const own = !override || override === "default"
    ? site
    : EFFECTS.includes(override as KineticEffect) ? (override as KineticEffect) : "none";
  if (own === "rotate" && list.length === 0) return { effect: "none", words: [] };
  return { effect: own, words: own === "rotate" || own === "highlight" ? list : [] };
}

/** The heading less its last word, and the last word. */
export function splitLast(text: string): { head: string; last: string } {
  const t = text.trimEnd();
  const cut = t.lastIndexOf(" ");
  return cut < 0 ? { head: "", last: t } : { head: t.slice(0, cut).trimEnd(), last: t.slice(cut + 1) };
}

/** The word to mark: the first case-insensitive match of `word`, else the last word. */
export function findMark(text: string, word: string | undefined): { before: string; mark: string; after: string } {
  const t = text.trimEnd();
  if (word) {
    const at = t.toLowerCase().indexOf(word.toLowerCase());
    if (at >= 0) return { before: t.slice(0, at), mark: t.slice(at, at + word.length), after: t.slice(at + word.length) };
  }
  const { head, last } = splitLast(t);
  return { before: head ? `${head} ` : "", mark: last, after: "" };
}
