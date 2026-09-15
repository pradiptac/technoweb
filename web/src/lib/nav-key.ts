/**
 * The key a navigation entry is looked up and listed by.
 *
 * An entry's `href` used to be the key everywhere — `menu[item.href]`,
 * `key={item.href}` — and it was never null. A **heading** (a custom menu item
 * with no address and items under it) has no href, so the key falls back to
 * the label under a prefix that cannot collide with a path. In a plain module
 * rather than `lib/navigation.ts`, because that file is `server-only` and the
 * header and the drawer are client components.
 */
export function navKey(entry: { href: string | null; label: string }): string {
  return entry.href ?? `heading:${entry.label}`;
}
