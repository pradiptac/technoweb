/**
 * Tell the API which address the 404 page was shown for (0.137.0, "Missing
 * pages").
 *
 * Reported by the browser, from the not-found screen, and not by the server for
 * two reasons that decide the shape of it: a not-found boundary is given no
 * params, so only client code knows the address; and the proxy that sees every
 * request cannot know, when it forwards one, that the page behind it will turn
 * out not to exist. `document.referrer` is the page that linked here, which is
 * the other half of what an SEO manager needs and which no server-side check
 * has once the request has been routed.
 *
 * `keepalive`, so the report survives a reader who leaves at once — which is
 * what somebody does on a 404. Posted to the website's own route handler, not
 * the API: `API_BASE_URL` is a server-side variable this bundle does not have,
 * and a cross-origin POST would have to clear CORS first.
 *
 * Everything about it fails quietly. The reader is already looking at an error
 * page, and a monitor that can throw turns one missing page into two.
 *
 * Once per address per page load: the effect that calls this runs twice under
 * React's development double-mount, and a visitor who stays on a 404 should
 * count as one request for it, not as two.
 */
const reported = new Set<string>();

export function reportNotFound(pathname: string): void {
  try {
    if (!pathname || reported.has(pathname)) return;
    reported.add(pathname);

    void fetch("/api/not-found", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer: document.referrer }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never be the thing that breaks the 404 page.
  }
}
