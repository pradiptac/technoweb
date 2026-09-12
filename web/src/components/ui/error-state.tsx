import type { ReactNode } from "react";

/**
 * A screen that could not load, said in a panel.
 *
 * In its own module rather than beside `EmptyState`, and the reason is the
 * client bundle: every area's `error.tsx` is a client component that Next
 * bundles for every route in that area, and it renders this. While this sat
 * in `empty.tsx` next to `EmptyState` — which draws an `IconTile`, which
 * imports `iconMap` — the public site's error boundary pulled all ~130 SVG
 * icon components into the initial JavaScript of every marketing page (47KB,
 * 14KB gzipped) to be ready for a panel with no icon in it. `empty.tsx`
 * re-exports this so every other call site keeps its import path.
 */
export function ErrorState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    /*
      Tokens, not literals — the same fix `Alert` and `Badge` needed. This one
      is the worst place to have had it: it renders when a screen cannot load,
      so in dark the explanation of what went wrong was itself unreadable.
    */
    <div role="alert" className="rounded-lg border border-err/25 bg-err-soft px-5 py-6">
      <h2 className="text-base text-err">{title}</h2>
      {children && <p className="mt-1.5 text-[13.5px] text-err/85">{children}</p>}
    </div>
  );
}
