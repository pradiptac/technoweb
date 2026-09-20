/**
 * Send a client-side failure to the API, from the browser it happened in.
 *
 * Both error boundaries carried `console.error(error)` and a
 * `TODO(phase 6): forward to an error tracker` — so a crash on somebody else's
 * machine was recorded in a console nobody was watching, on a device we do not
 * have. Nothing else in the product knew it had happened.
 *
 * **Posted straight from the browser, not through a Server Action.** An action
 * is a render pass on the very framework that has just failed, and the error
 * boundary exists precisely because something in that path went wrong; a plain
 * `fetch` to a route handler is the one thing here with no React in it. It also
 * means a *hydration* failure can still be reported, which is the class of bug
 * that this is most worth having for.
 *
 * `keepalive`, so the report survives the reader closing the tab or navigating
 * away — which is exactly what somebody does when a page breaks.
 *
 * Everything about it fails quietly. An error handler that can itself throw
 * turns one broken page into a loop, and there is nothing useful to say to a
 * reader about the reporting of an error they have already been told about.
 */
export function reportError(
  area: "site" | "admin" | "portal",
  error: Error & { digest?: string },
): void {
  try {
    const body = JSON.stringify({
      area,
      // The message, or the class name when there is no message — an empty
      // report is worse than a vague one, and a production build often has
      // only the digest to go on.
      message: String(error?.message || error?.name || "Unknown error").slice(0, 2000),
      /*
       * Next's server digest.
       *
       * A production build replaces a server error's message with a hash, so
       * this is frequently the only way to match what the browser saw to the
       * stack trace in the server log. Without it a production report says "an
       * error occurred" and nothing more.
       */
      digest: error?.digest ?? null,
      path: window.location.pathname + window.location.search,
    });

    /*
     * Through the frontend's own origin.
     *
     * A `fetch` straight at the API origin would be a cross-origin request that
     * has to clear CORS from a page that is already broken, and the API's URL is
     * a server-side environment variable this bundle does not have. The route
     * handler beside this file forwards it.
     */
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never be the thing that breaks the error screen.
  }
}
