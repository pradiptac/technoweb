import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/admin-auth";
import { landingFor } from "@/lib/admin-landing";
import { permits, screenRole } from "@/app/admin/(app)/nav-items";
import { screenPath } from "@/app/admin/(app)/nav-match";

/**
 * Refuse a console screen this account's roles do not open.
 *
 * The console's role gate, as one call. The sidebar only *offers* what a role
 * may use; this is what makes the page agree with the API, which refuses the
 * data regardless — defence in depth, not the access control.
 *
 * **Called from every page under `admin/(app)`, not only the layout**, and the
 * reason is how the App Router renders. A layout is rendered on the first load
 * and then kept: a client-side navigation re-renders only the segments that
 * changed, and which ones "changed" is decided from the router state the
 * *browser* sends. So a check in a layout ran once per visit and never for the
 * screens reached from the sidebar afterwards, and a hand-made request could
 * skip it outright by claiming to hold the layout already. The page is the one
 * segment that is always rendered, so that is where the check has to sit. The
 * `(app)` layout keeps its own call for the first load, where it runs before
 * anything streams and so answers with a real 404 or redirect.
 *
 * The path comes from `x-pathname`, which `proxy.ts` overwrites on every
 * `/admin` request — prefetches included — and `screenPath()` decodes it, so
 * `/admin/%73ettings` is judged as `/admin/settings`. **No path is a refusal**:
 * it means the proxy did not run, and a gate that opens when its input is
 * missing is not a gate.
 */
export async function requireScreen(): Promise<void> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/admin/login");

  const slugs = staff.roles.map((r) => r.slug);
  const path = screenPath((await headers()).get("x-pathname"));

  if (path === null) notFound();

  if (!permits(slugs, screenRole(path))) {
    // The dashboard is the one screen every sign-in passes through, so a role
    // without it is sent to its own landing rather than shown a 404.
    if (path === "/admin") redirect(landingFor(slugs));
    notFound();
  }
}
