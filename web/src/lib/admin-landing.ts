/**
 * Where a staff account should land after signing in.
 *
 * `/admin` is the ticket dashboard and needs `support_engineer`, so sending
 * everybody there put a campaign manager or an SEO manager on "We could not
 * load the dashboard" the moment they signed in — with, now that the sidebar is
 * filtered, no dashboard link to explain why. Filtering the navigation without
 * this would have turned a confusing landing into a dead one.
 *
 * Pure and dependency-free on purpose: `lib/admin-auth.ts` is `server-only` and
 * this is wanted from a server action, a page and (eventually) a test.
 */
const LANDING: { role: string; path: string }[] = [
  // Order is priority, not preference: the first role somebody holds decides
  // where they land, and an administrator has the run of the place so the
  // dashboard is right for them.
  { role: "admin", path: "/admin" },
  { role: "support_engineer", path: "/admin" },
  { role: "content_manager", path: "/admin/blog" },
  { role: "campaign_manager", path: "/admin/newsletter" },
  { role: "seo_manager", path: "/admin/seo" },
];

export function landingFor(roles: string[]): string {
  const match = LANDING.find((l) => roles.includes(l.role));

  // Your own account: reachable by every role, and the only honest answer for
  // an account somebody created and gave no role to.
  return match?.path ?? "/admin/profile";
}
