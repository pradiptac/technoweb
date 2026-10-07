"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A "Copy" button for a line somebody has to paste somewhere else exactly —
 * a command, a path. `CopyLink`'s rules, with words instead of a glyph: the
 * confirmation is the button's own label for two seconds plus a `role=status`
 * sentence, written from the click handler and never from an effect.
 *
 * `navigator.clipboard` is unavailable on an insecure origin (a console
 * opened over plain http on a LAN address) and refused by some embedded
 * browsers; a failed copy says so rather than claiming success, and the text
 * is still on the screen to select by hand.
 */
export function CopyText({ text, label = "Copy", what = "The command" }: { text: string; label?: string; what?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={copy}>
        {state === "done" ? "Copied" : state === "failed" ? "Select it and copy by hand" : label}
      </Button>
      <span role="status" className="sr-only">
        {state === "done" ? `${what} was copied to the clipboard.` : state === "failed" ? `${what} could not be copied.` : ""}
      </span>
    </>
  );
}
