/**
 * "R. Kulkarni" → "RK", "Priya Nair" → "PN": the first letter of each of the
 * first two words, punctuation dropped. One definition — the team cards and
 * the homepage testimonial each had their own (2026-09-21), and only one of
 * them stripped the dot, so a punctuation-led name got a different initial
 * on the two screens.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
