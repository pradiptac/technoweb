"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconLink } from "@/components/icons";

/**
 * "Copy link", the one share target that is not a URL to somebody else's
 * site — so it is the one that needs a script, and it lives in its own client
 * module so `ShareLinks` stays a server component and the six plain links
 * around it ship no JavaScript at all.
 *
 * The confirmation is a swap of the glyph and a live region, not an alert: a
 * tick for two seconds says "done" to somebody looking, and the `role=status`
 * sentence says it to somebody who is not. Written from the click handler,
 * never from an effect — `react-hooks/set-state-in-effect`.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and refused by
 * some embedded browsers; a failed copy is reported as such rather than
 * ticking anyway, and the link is still on the page to select by hand.
 */
export function CopyLink({ url, className }: { url: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("done");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={state === "done" ? "Link copied" : "Copy link"}
        title="Copy link"
        className={className}
      >
        {state === "done" ? <IconCheck className="size-4" aria-hidden /> : <IconLink className="size-4" aria-hidden />}
      </button>
      <span role="status" className="sr-only">
        {state === "done" ? "Link copied to the clipboard." : state === "failed" ? "The link could not be copied." : ""}
      </span>
    </>
  );
}
