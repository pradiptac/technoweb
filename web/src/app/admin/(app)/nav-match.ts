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

/**
 * The path a role is judged on, from the proxy's `x-pathname`.
 *
 * Decoded, because the proxy forwards the path as requested and the router
 * decodes before it matches: `/admin/%73ettings` renders Settings while
 * matching no row here, and no row means no role to check — the percent sign
 * was a way round the gate. Doubled and trailing slashes are folded for the
 * same reason. Anything that does not decode, is not under `/admin`, or
 * carries a `.`/`..` segment is `null`, which every caller treats as a
 * refusal rather than as "no row, so allowed".
 */
export function screenPath(raw: string | null): string | null {
  if (!raw) return null;

  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }

  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  if (path !== "/admin" && !path.startsWith("/admin/")) return null;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return null;

  return path;
}
