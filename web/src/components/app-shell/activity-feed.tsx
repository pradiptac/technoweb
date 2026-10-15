import Link from "next/link";
import type { ReactNode } from "react";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ActivityItem = { id: string; text: ReactNode; href?: string; at: string; tone?: "brand" | "info" | "ok" | "warn" };

const DOT = { brand: "bg-brand-600", info: "bg-info", ok: "bg-ok", warn: "bg-warn" } as const;

/**
 * A vertical timeline (Console 2.0): a dot on a line, the words, how long
 * ago. A server component — the relative time is worked out once, where it
 * is rendered, so there is nothing to disagree about on hydration.
 */
export function ActivityFeed({ items, empty = "Nothing has happened yet." }: { items: ActivityItem[]; empty?: string }) {
  if (items.length === 0) return <p className="text-13 text-muted">{empty}</p>;
  return (
    <ol className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
      {items.map((i) => (
        <li key={i.id} className="relative flex min-w-0 gap-3">
          <span aria-hidden className={cn("relative z-[1] mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card", DOT[i.tone ?? "brand"])} />
          <div className="min-w-0 flex-1">
            <p className="text-13 [overflow-wrap:anywhere]">
              {i.href ? <Link href={i.href} className="hover:underline">{i.text}</Link> : i.text}
            </p>
            <p className="text-12 text-faint"><time dateTime={i.at}>{relativeTime(i.at)}</time></p>
          </div>
        </li>
      ))}
    </ol>
  );
}
