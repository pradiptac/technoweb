/**
 * Next runs this file once in the browser, before hydration, and calls the
 * hooks it exports. The one used here is `onRouterTransitionStart`: the
 * router's own word that a navigation has begun — for a `<Link>`, a
 * `router.push`, and back/forward alike, and for nothing else. That is what
 * makes it the right start signal for the route-change loader
 * (components/ui/route-progress.tsx): a `tel:` link, a CSV download, an
 * external link or an anchor a component intercepts never reaches the
 * router, so none of them can start a bar that nothing finishes — which is
 * what sniffing document clicks would have produced.
 *
 * The hook cannot render, so it is bridged to the component as a DOM event
 * carrying the target URL. The component decides whether the URL is worth a
 * bar; this file only reports.
 */
export function onRouterTransitionStart(url: string) {
  window.dispatchEvent(new CustomEvent("tw:navigate", { detail: url }));
}
