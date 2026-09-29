"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconHeart } from "@/components/icons-ui";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  announceWishlistChange, currentWishlist, setWishlistOptimistic, useWishlist,
} from "@/lib/wishlist-events";
import { removeFromWishlistAction, saveToWishlistAction } from "@/components/store/wishlist-actions";
import type { VisibleWishlist } from "@/components/store/wishlist-actions";
import type { WishlistLine } from "@/types/api";

/**
 * Save a product for later — the heart on a card and on the product page.
 *
 * **A client island on a cached page.** The shop's pages are served whole from
 * the ISR cache, so the server draws every heart empty and `useWishlist()`
 * fills the pressed ones a moment after mount from one shared fetch — the
 * basket count's arrangement. A visitor with a list sees it one round trip
 * late on a cold load; every visitor gets a cached page.
 *
 * **Optimistic.** The heart fills (or empties) the moment it is pressed and the
 * count follows; the Server Action's answer replaces the guess, and a refusal
 * puts the previous list back and says why in a toast. A second press while
 * one is in flight is ignored rather than queued — two racing toggles on one
 * heart settle on whichever the server saw last, which is not what the
 * person meant by pressing twice.
 *
 * A `button` with `aria-pressed`, and its name does not change with its state
 * — "Save A switch to your wishlist", pressed or not — because a toggle that
 * renames itself is announced as a different control. At least 36px on a
 * card and 44px on the page, over the audit's 24px floor, since it sits in a
 * corner of a picture people also tap to open the product.
 *
 * Motion: the press shrinks it through the `scale` *property* (`active:scale-90`
 * with `transition-[scale,…]` — Tailwind v4's scale utilities set `scale`, not
 * `transform`, the trap `CLAUDE.md` records), and becoming saved pops the
 * glyph once through `.wish-heart[data-pop]` in `globals.css`, inside the
 * reduced-motion guard. `data-pop` is set only by a press, never by the
 * list arriving after mount, or every saved heart on a grid would pop at once
 * on load.
 */
export function WishlistHeart({
  productId, variationId = null, name, variant = "card", className,
}: {
  productId: number;
  variationId?: number | null;
  name: string;
  variant?: "card" | "page";
  className?: string;
}) {
  const { list } = useWishlist();
  const [pending, start] = useTransition();
  const [pop, setPop] = useState(0);
  const toast = useToast();

  const line = list?.items.find(
    (i) => i.product_id === productId && (i.variation_id ?? null) === (variationId ?? null),
  );
  const pressed = Boolean(line);

  const press = () => {
    if (pending) return;

    const before = currentWishlist();
    const saving = !pressed;

    setWishlistOptimistic(saving ? withLine(before, productId, variationId, name) : withoutLine(before, line?.id));
    if (saving) setPop((n) => n + 1);

    start(async () => {
      const result = saving
        ? await saveToWishlistAction(productId, variationId)
        : line && line.id > 0
          ? await removeFromWishlistAction(line.id)
          : { error: "Try that again in a moment." };

      if (result.error || !result.list) {
        setWishlistOptimistic(before);
        toast({ tone: "err", title: saving ? "Not saved" : "Not removed", body: result.error });

        return;
      }

      setWishlistOptimistic(result.list);
      announceWishlistChange(result.list);

      if (saving) {
        toast({
          tone: "ok",
          title: "Saved to your wishlist",
          body: <Link href="/store/wishlist" className="underline">See your wishlist</Link>,
        });
      }
    });
  };

  const label = `Save ${name} to your wishlist`;

  if (variant === "page") {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={`Wishlist — ${label}`}
        aria-busy={pending || undefined}
        onClick={press}
        data-pop={pop > 0 && pressed ? pop : undefined}
        onAnimationEnd={() => setPop(0)}
        className={cn(
          "wish-heart inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-14 font-semibold",
          "transition-[scale,color,background-color,border-color] duration-(--duration-fast) ease-brand motion-safe:active:scale-95",
          pressed
            ? "border-err-fill/40 bg-err-soft text-err"
            : "border-line-strong bg-card text-ink hover:border-faint",
          className,
        )}
      >
        <IconHeart aria-hidden className={cn("size-5 shrink-0", pressed && "fill-current")} />
        Wishlist
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={pressed ? "On your wishlist" : "Save to your wishlist"}
      aria-busy={pending || undefined}
      // A theme moves the card's heart by this, off a picture it would cover.
      data-tile-save=""
      onClick={press}
      data-pop={pop > 0 && pressed ? pop : undefined}
      onAnimationEnd={() => setPop(0)}
      className={cn(
        "wish-heart grid size-9 place-items-center rounded-full border border-line-strong bg-card shadow-1",
        "transition-[scale,color,border-color] duration-(--duration-fast) ease-brand motion-safe:active:scale-90",
        pressed ? "text-err-fill" : "text-muted hover:text-ink",
        className,
      )}
    >
      <IconHeart aria-hidden className={cn("size-[18px]", pressed && "fill-current")} />
    </button>
  );
}

/** The list with a placeholder line for a heart just pressed — replaced by the server's answer. */
function withLine(list: VisibleWishlist | null, productId: number, variationId: number | null, name: string): VisibleWishlist {
  const base: VisibleWishlist = list ?? { account: false, items: [], item_count: 0, email: null, alerts: false };
  const placeholder: WishlistLine = {
    id: -Date.now(), product_id: productId, variation_id: variationId, name, variation_name: null, slug: "",
    image_url: null, image_alt: null, price_paise: 0, price_at_save_paise: 0, saving_paise: null,
    in_stock: true, needs_choice: false, added_at: null,
  };

  return { ...base, items: [placeholder, ...base.items], item_count: base.item_count + 1 };
}

function withoutLine(list: VisibleWishlist | null, id: number | undefined): VisibleWishlist | null {
  if (!list || id === undefined) return list;

  const items = list.items.filter((i) => i.id !== id);

  return { ...list, items, item_count: items.length };
}
