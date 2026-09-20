"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

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
 */
export function PageEnter({ children }: { children: ReactNode }) {
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

  return (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  );
}
