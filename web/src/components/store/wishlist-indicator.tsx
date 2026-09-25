"use client";

import Link from "next/link";
import { IconHeart } from "@/components/icons-ui";
import { useWishlist } from "@/lib/wishlist-events";

/**
 * The wishlist's count in the shop's strip, beside the basket.
 *
 * The basket indicator's arrangement, and for its reason: the strip is on
 * every cached shop page, so the server draws this at nothing and
 * `useWishlist()` fills the count after mount — one fetch shared with every
 * heart on the page, and none at all for a visitor with no list and no
 * session (`/api/store/wishlist` answers 204 without asking the API).
 *
 * An icon and a count, no words: the strip is at its measured width on a
 * phone, where it already shares a row between Apply and the basket, and a
 * heart with a number on it needs no label to be read. The name is on the
 * link for a screen reader, with the count in it so it is heard.
 */
export function WishlistIndicator() {
  const { list } = useWishlist();
  const count = list?.item_count ?? 0;

  return (
    <Link
      href="/store/wishlist"
      data-wishlist-count={count}
      aria-label={count === 1 ? "Wishlist, 1 saved" : `Wishlist, ${count} saved`}
      title="Your wishlist"
      className="relative grid size-10 shrink-0 place-items-center rounded-full border border-line-strong bg-card text-ink transition-colors duration-(--duration-base) hover:border-faint"
    >
      <IconHeart aria-hidden className={count > 0 ? "size-5 fill-err-fill text-err-fill" : "size-5"} />
      {count > 0 && (
        /*
          The basket's badge shape, in the brand's fill rather than its red:
          the heart is already red once it holds something, and two red
          discs side by side would read as two baskets. `brand-on` on
          `brand-600` is the pair measured to carry text in both schemes.
        */
        <span
          aria-hidden
          className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-page bg-brand-600 text-11 font-bold text-brand-on tabular-nums"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
