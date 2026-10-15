"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy, IconLink } from "@/components/icons-ui";

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
export function CopyLink({ url, className, what }: {
  url: string;
  className?: string;
  /** Something other than a link — the text copied is `url` all the same, under a copy glyph ("email address"). */
  what?: string;
}) {
  const noun = what ?? "link";
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
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
        aria-label={state === "done" ? `${Noun} copied` : `Copy ${noun}`}
        title={`Copy ${noun}`}
        className={className}
      >
        {state === "done" ? <span data-copied="" className="inline-grid"><IconCheck className="size-4" aria-hidden /></span> : what ? <IconCopy className="size-4" aria-hidden /> : <IconLink className="size-4" aria-hidden />}
      </button>
      <span role="status" className="sr-only">
        {state === "done" ? `${Noun} copied to the clipboard.` : state === "failed" ? `The ${noun} could not be copied.` : ""}
      </span>
    </>
  );
}
