/**
 * Whether a tile's figure may count up (`CountUp`): a plain count or a
 * percentage, ungrouped or grouped in threes. Not a price (`₹…`), not a
 * "3 of 7", not a timing ("412 ms"), not an em dash — the project's rule for
 * count-ups — and not an Indian-grouped figure ("1,23,456"), because
 * `CountUp` regroups in threes and would leave "123,456" behind.
 */
export function countable(value: string): boolean {
  return /^(\d+|\d{1,3}(,\d{3})+)%?$/.test(value.trim());
}
