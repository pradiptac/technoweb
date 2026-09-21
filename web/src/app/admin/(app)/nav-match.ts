/**
 * Which sidebar row a path belongs to.
 *
 * One rule, used twice: `screenRole()` in nav-items.tsx asks it which row's
 * role gates a path, and admin-nav.tsx asks it which row to light. It is the
 * **longest** row whose href is the path or a parent of it; an `exact` row
 * matches only itself. That is what lets a section hold both `/admin/tickets`
 * and `/admin/tickets/settings`: the settings row is longer, so it wins on
 * its own path and nowhere else, and `/admin/tickets/TW-…` still resolves to
 * Tickets — with no `exact` flag on Tickets, which would have made the
 * detail pages match no row at all and dropped the role gate on every one.
 *
 * Its own module, with no imports, because admin-nav.tsx is a client
 * component that may only `import type` from nav-items.tsx — a value import
 * would drag the icon map into the client bundle (the Turbopack trap in
 * CLAUDE.md).
 */
export function bestRow<T extends { href: string; exact?: boolean }>(rows: T[], pathname: string): T | undefined {
  let best: T | undefined;

  for (const row of rows) {
    const matches = row.exact ? pathname === row.href : pathname === row.href || pathname.startsWith(`${row.href}/`);
    if (matches && (best === undefined || row.href.length > best.href.length)) best = row;
  }

  return best;
}
