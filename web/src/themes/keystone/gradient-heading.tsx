import type { ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * A heading whose closing words run through the brand-to-accent gradient —
 * the reference's "The Enterprise **Data Platform**".
 *
 * The last two words (one, for a short heading) are wrapped in a span
 * whose *fill* is the gradient: `background-clip: text` with
 * `-webkit-text-fill-color: transparent`, while the span's `color` stays
 * `brand-ink`. That is deliberate rather than the usual
 * `text-transparent`: the contrast audit reads an element's computed
 * `color`, and a transparent one would be graded as nothing at all. Both
 * ends of the gradient are the two coloured-text inks the palette gate
 * pushes to 4.5:1 on the page and on surface-2 (`brand-ink`,
 * `accent-ink`), so every point of the run is between two passing inks and
 * the solid colour the audit reads is one of them. Where the split falls
 * is a property of the words, not of the markup, so an editor's heading
 * from Settings takes the treatment without knowing about it.
 */
export function GradientHeading({ text, as: Tag = "h1", className }: { text: string; as?: ElementType; className?: string }) {
  const words = text.trim().split(/\s+/);
  const n = words.length > 3 ? 2 : words.length > 1 ? 1 : 0;
  const head = words.slice(0, words.length - n).join(" ");
  const tail = words.slice(words.length - n).join(" ");
  return (
    <Tag className={cn(className)}>
      {head}
      {tail && (
        <>
          {" "}
          <span className="keystone-gradient bg-linear-to-r from-brand-ink to-accent-ink bg-clip-text text-brand-ink">{tail}</span>
        </>
      )}
    </Tag>
  );
}
