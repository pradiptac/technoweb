"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, useLayoutEffect, useRef, type ReactNode } from "react";
import { pageViewTransition } from "@/lib/motion-choices";

/**
 * The page-transition host. Wraps `{children}` of an area layout and carries
 * `.page-enter`, which `[data-motion-page="…"] .page-enter` in globals.css
 * animates — for the default, `none`, it is a plain block `div` with no
 * rule on it at all.
 *
 * **Not a `template.tsx`.** A template is remounted on navigation, which
 * sounds like exactly this, but it is keyed on the layout's *immediate*
 * child segment: `/products` → `/products/[slug]` is the same segment,
 * `products`, and every move inside the shop or the blog would have played
 * nothing. This restarts the CSS animation itself on every pathname change
 * instead, in a layout effect so it runs before paint — an ordinary effect
 * would show one frame of the new page at full opacity and then dip it.
 *
 * Deliberately **not** `key={pathname}`: remounting the subtree from here
 * throws away the router's own cached state for it. And deliberately
 * pathname only — a search-param change is pagination or a sort, and
 * replaying an entrance for page two reads as the page being reloaded.
 *
 * **The entrance plays on client navigations only.** The animated selector is
 * `.page-enter.page-enter-active`, and the modifier is added on the first
 * pathname change rather than rendered — so the server's HTML carries no
 * animation and the initial load paints at once. It used to animate on the
 * cold load too, which meant `motion_page` set to anything but `none` held
 * the whole page at `opacity: 0` for 320–380ms before the largest element
 * could count as painted: a setting that added a third of a second to LCP
 * on every first visit to buy an entrance nobody sees twice.
 *
 * **Crossfade and Slide are the browser's, not this component's** (0.115.0).
 * For those two `motion_page` ids the host is wrapped in React's
 * `<ViewTransition>`, which the App Router drives on every navigation (a
 * navigation is a transition) through `document.startViewTransition`; for
 * every other id there is no wrapper at all, so the markup — and the
 * behaviour — is what it always was. The boundary is the one `.page-enter`
 * div, so React names exactly one element.
 *
 * Its `name` is derived from the pathname, which is the whole trick. React
 * names the old element with the old props and the new one with the new,
 * so a navigation hands the browser two *different* names — an old page with
 * no partner and a new page with no partner — instead of one element to
 * morph. That matters because Next scrolls to the top inside the same
 * commit: a morphing pair would glide the whole page down by however far the
 * visitor had scrolled. Unpartnered, the old page leaves from exactly where
 * it was seen and the new one arrives where it will stay. Everything else
 * that commits inside a transition with the pathname unchanged — a Server
 * Action's refresh, a search param, a Suspense reveal — keeps one name, is a
 * pair, and the CSS gives a pair no animation (`.tw-page-*` in globals.css
 * animates `:only-child` images only). Every navigation plays the same way
 * round, back and forward included: Next tags none of them, and tagging every
 * `Link` for a direction is not worth what it would cost.
 *
 * The layout effect below still runs for these two ids; no `.page-enter`
 * rule keys on them, so there is simply nothing for it to restart.
 */
export function PageEnter({ children, transition }: {
  children: ReactNode;
  /** The `motion_page` id. Only `crossfade` and `slide` change anything here. */
  transition?: string | null;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    // The first client navigation arms the animated selector; every one after
    // it restarts the animation that is now there. Under `none` or reduced
    // motion there is no animation to restart and the list is empty, which
    // is the whole of that case.
    el.classList.add("page-enter-active");
    el.getAnimations().forEach((a) => {
      a.cancel();
      a.play();
    });
  }, [pathname]);

  const host = (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  );

  const view = pageViewTransition(transition);
  if (!view) return host;

  return (
    <ViewTransition name={`tw-page-${pathKey(pathname)}`} default="none" update={`tw-page-${view}`}>
      {host}
    </ViewTransition>
  );
}

/**
 * A pathname as a short CSS ident: FNV-1a, base 36. A collision between two
 * paths would only make that one navigation a pair — and so instant.
 */
function pathKey(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
