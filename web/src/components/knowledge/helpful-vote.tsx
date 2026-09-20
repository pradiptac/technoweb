"use client";

import { useSyncExternalStore, useState } from "react";
import { IconThumbsUp } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

const KEY = "tw_kb_helpful";

/** The slugs this browser has already voted on, or an empty set where storage is unavailable. */
function voted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

/**
 * "Was this helpful?" at the foot of a knowledge-base article.
 *
 * One press, one increment, once per browser: the slug is remembered in
 * `localStorage`, so the buttons render as "Thanks" on a return visit rather
 * than inviting a second vote. That is the whole of the anti-gaming — the
 * count is a hint for the desk about which articles deflect tickets, not a
 * figure anybody banks, and the API's throttle bounds the rest.
 *
 * "No" sends nothing and says where to go instead: the value of a no is the
 * ticket form it points at, with the subject filled in, and counting noes
 * would only tell the desk what the unanswered list already does.
 *
 * Read through `useSyncExternalStore` with a null server snapshot, so the
 * pre-hydration render never assumes a vote — the consent banner's rule.
 */
export function HelpfulVote({ slug, title }: { slug: string; title: string }) {
  const already = useSyncExternalStore(subscribe, () => voted().has(slug), () => false);
  const [done, setDone] = useState<"yes" | "no" | null>(null);

  const yes = () => {
    setDone("yes");
    try {
      localStorage.setItem(KEY, JSON.stringify([...voted(), slug]));
    } catch {
      // Storage refused (a private window): the vote still goes, it is just not remembered.
    }
    void fetch("/api/knowledge-base/helpful", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => undefined);
  };

  const ticket = `/portal/tickets/new?subject=${encodeURIComponent(title)}`;

  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 rounded-xl border border-line-strong bg-card px-5 py-4" aria-live="polite">
      {already || done === "yes" ? (
        <p className="text-14 text-muted">
          <IconThumbsUp className="mr-1.5 inline size-4 align-[-3px] text-brand-ink" aria-hidden />
          Thanks — that helps us decide what to write next.
        </p>
      ) : done === "no" ? (
        <p className="text-14 text-muted">
          Sorry it did not. <a href={ticket} className="font-semibold text-brand-ink underline underline-offset-2">Raise a ticket</a> and an engineer will pick it up.
        </p>
      ) : (
        <>
          <p className="text-14 font-semibold text-ink">Was this helpful?</p>
          <div className="flex gap-2">
            <button type="button" onClick={yes} className={cn(btn, "hover:border-brand-300 hover:bg-brand-50")}>
              <IconThumbsUp className="size-4" aria-hidden /> Yes
            </button>
            <button type="button" onClick={() => setDone("no")} className={cn(btn, "hover:border-line-strong hover:bg-surface-2")}>
              No
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 text-13-5 font-semibold text-ink transition-colors duration-(--duration-base)";
