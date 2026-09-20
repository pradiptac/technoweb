"use client";

import dynamic from "next/dynamic";

/**
 * `IconField` needs the whole `iconMap` by design — it is the one control
 * that shows every glyph — and that map is the ~130-icon module Turbopack
 * keeps whole. Loaded through `next/dynamic` it becomes its own chunk that
 * arrives after the form's, rather than a 47KB tax paid before the first
 * field is interactive. Server-rendered still, so the hidden `icon` input is
 * in the markup and the grid does not pop in.
 */
export const IconField = dynamic(() => import("./icon-field").then((m) => m.IconField), {
  loading: () => (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">Icon</span>
      <div className="h-40 animate-pulse rounded border border-line-strong bg-surface" aria-hidden />
    </div>
  ),
});
