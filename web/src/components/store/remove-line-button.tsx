"use client";

import { useTransition } from "react";
import { IconTrash } from "@/components/icons";
import { removeCartLineAction } from "@/app/(marketing)/store/actions";

/**
 * Take one line out of the basket.
 *
 * **Not a `<form>`, and that is not a style choice.** The basket indicator is
 * rendered inside the shop's filter form on `/store`, and HTML forbids nesting
 * one form in another — a browser silently drops the inner one, so the button
 * would render, be pressable, and do nothing at all on the one screen where
 * most people would press it. Calling the Server Action from a transition needs
 * no form element and works identically in both places the basket appears.
 *
 * The cost is that this needs JavaScript, where a form would not. That is the
 * right trade *here* specifically: the panel it lives in only opens on hover,
 * which is already a pointer-and-JavaScript affordance, and `/cart` — which
 * works with none — keeps its own plain form.
 */
export function RemoveLineButton({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      // The name, so a screen reader hears which line this removes. Four
      // buttons all announcing "Remove" is four identical targets.
      aria-label={`Remove ${name} from the basket`}
      title="Remove"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const data = new FormData();
          data.set("id", String(id));
          await removeCartLineAction(data);
        });
      }}
      /*
        24px, which is the floor `npm run audit` enforces — and the glyph is
        14px inside it rather than the box being shrunk to the glyph. The
        audit also fails an undersized target with another within 24px of its
        centre, which is why this sits at the end of the row rather than beside
        the price.
      */
      className="grid size-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-err-soft hover:text-err disabled:opacity-50"
    >
      <IconTrash className="size-3.5" />
    </button>
  );
}
