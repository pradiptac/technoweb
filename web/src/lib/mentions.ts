/*
 * @-mentions in a plain-text note (C2, docs/notifications.md). The note stays
 * text; the server decides who is told. These helpers only find, insert and
 * highlight — and never parse HTML, because nothing here is HTML.
 * `scripts/mentions.check.mjs` pins them.
 */

/** The @-query being typed at the caret, or null. An @ must start a word, so an address is not a mention. */
export function findMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/[\s(\[]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || query.length > 40) return null;
  return { start: at, query };
}

/** Replaces the @-query between `start` and `caret` with the chosen name and a space. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const token = `@${name} `;
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}

/** Splits text into runs, marking `@Name` for the names given (longest first, case-insensitive). */
export function mentionSegments(text: string, names: string[]): { text: string; mention: boolean }[] {
  const wanted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return [{ text, mention: false }];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(?:${wanted.map(escape).join("|")})`, "gi");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), mention: false });
    out.push({ text: m[0], mention: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out;
}

/**
 * The ids a note mentions, kept to positive integers, once each. Takes the
 * form's `mentions[]` values (`formData.getAll("mentions[]")`) — one hidden
 * input per person, so a multipart post reaches the API as a list too — or a
 * JSON list.
 */
export function mentionIdsFrom(raw: unknown): number[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => (typeof v === "number" || typeof v === "string" ? Number(v) : NaN)).filter((n) => Number.isInteger(n) && n > 0))];
}
