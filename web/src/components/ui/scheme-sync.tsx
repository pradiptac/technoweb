"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyScheme, areaForPath, readPreference, resolve, SCHEME_EVENT } from "@/lib/scheme";

/**
 * Keeps the painted scheme matching the area you are actually in.
 *
 * The inline script in the head gets the first paint right, but it only runs
 * on a document load. Moving between the console and the public site is a
 * client-side navigation — the "View site" link in the console header is one —
 * and no document loads, so without this the console's dark scheme would
 * follow you onto a site you had set to light.
 *
 * Mounted once in the root layout rather than per area: it reads the path, so
 * one instance covers both and there is no arrangement of layouts where the
 * two disagree about whose preference is in force.
 */
export function SchemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => applyScheme(resolve(readPreference(areaForPath(pathname))));

    apply();

    // Also re-apply when a *different* tab changes the stored value, or when
    // the OS flips while "system" is in force.
    window.addEventListener("storage", apply);
    window.addEventListener(SCHEME_EVENT, apply);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);

    return () => {
      window.removeEventListener("storage", apply);
      window.removeEventListener(SCHEME_EVENT, apply);
      mq.removeEventListener("change", apply);
    };
  }, [pathname]);

  return null;
}
