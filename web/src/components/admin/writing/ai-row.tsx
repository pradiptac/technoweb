"use client";

import type { ReactNode } from "react";
import { useWritingStatus } from "./ai-write-button";

/**
 * A small row above a field that holds its writing-help controls. Outside the
 * Field on purpose: a Field's hint is what the control is described by, and it
 * is replaced by the error when the save is refused. Draws nothing while
 * writing help is off.
 */
export function AiRow({ caption = "Writing help", children }: { caption?: string; children: ReactNode }) {
  const status = useWritingStatus();
  if (!status) return null;

  return (
    <div className="mb-1 flex min-w-0 flex-wrap items-center justify-end gap-2">
      {caption && <span className="text-12 text-muted">{caption}</span>}
      {children}
    </div>
  );
}
