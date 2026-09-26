"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { IconBox, IconHeart, IconTrash } from "@/components/icons-ui";
import { useToast } from "@/components/ui/toast";
import { announceBasketChange } from "@/lib/basket-events";
import { announceWishlistChange } from "@/lib/wishlist-events";
import { formatPaise } from "@/lib/money";
import {
  moveWishlistLineToBasketAction, removeFromWishlistAction, type VisibleWishlist,
} from "@/components/store/wishlist-actions";
import type { WishlistLine } from "@/types/api";

/**
 * The saved things, on `/store/wishlist` and the portal's Wishlist tab — one
 * component so the two cannot disagree about what a line says or does.
 *
 * Rendered by the server with the list in hand (both pages are dynamic: a list
 * is one person's) and kept in step here from each action's answer, so a move
 * or a remove updates the rows without a round trip for the page. Each change
 * is announced to the hearts and the count (`tw:wishlist`), and a move to the
 * basket to the basket indicator (`tw:cart`) as well.
 *
 * A line whose product has options but was saved without one cannot go
 * straight into a basket — the API would refuse it — so it offers "Choose
 * options" on the product page instead of a button that fails.
 */
export function WishlistList({ initial, headingLevel = 2 }: { initial: VisibleWishlist; headingLevel?: 2 | 3 }) {
  const [list, setList] = useState(initial);

  if (list.items.length === 0) {
    return (
      <EmptyState
        icon={<IconHeart />}
        title="Nothing saved yet"
        action={<ButtonLink href="/store" variant="secondary">Browse the store</ButtonLink>}
      >
        Press the heart on anything in the shop to keep it here for later.
      </EmptyState>
    );
  }

  return (
    <ul className="grid gap-3" aria-label="Saved products">
      {list.items.map((line) => (
        <Row key={line.id} line={line} headingLevel={headingLevel} onChange={setList} />
      ))}
    </ul>
  );
}

function Row({
  line, headingLevel, onChange,
}: {
  line: WishlistLine;
  headingLevel: 2 | 3;
  onChange: (list: VisibleWishlist) => void;
}) {
  const [pending, start] = useTransition();
  const [doing, setDoing] = useState<"move" | "remove" | null>(null);
  const toast = useToast();
  const Heading = `h${headingLevel}` as "h2" | "h3";
  const href = `/store/products/${line.slug}`;
  const name = line.variation_name ? `${line.name} — ${line.variation_name}` : line.name;

  const run = (kind: "move" | "remove") => {
    setDoing(kind);
    start(async () => {
      const result = kind === "move"
        ? await moveWishlistLineToBasketAction(line.id)
        : await removeFromWishlistAction(line.id);

      setDoing(null);

      if (result.error || !result.list) {
        toast({ tone: "err", title: kind === "move" ? "Not moved" : "Not removed", body: result.error });

        return;
      }

      onChange(result.list);
      announceWishlistChange(result.list);

      if (kind === "move") {
        announceBasketChange();
        toast({ tone: "ok", title: "Moved to your basket", body: <Link href="/cart" className="underline">View your basket</Link> });
      }
    });
  };

  return (
    <Card as="li" interactive={false} padding="sm" className="flex min-w-0 flex-wrap items-center gap-4">
      {/*
        A fixed 72px well, so a slow picture moves nothing — the rule every
        image on the site follows. `contain`, as the basket preview does: these
        are product shots, and a crop takes the end off a cable.
      */}
      <Link href={href} className="relative grid size-18 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface">
        {line.image_url
          ? <Image src={line.image_url} alt={line.image_alt ?? ""} fill sizes="72px" className="object-contain p-1" />
          : <span className="text-faint"><IconBox className="size-6" /></span>}
      </Link>

      {/* `min-w-0` + `basis` so a long product name wraps inside the row instead of widening the page at 320px. */}
      <div className="min-w-0 flex-1 basis-48">
        <Heading className="text-15 font-semibold leading-snug">
          <Link href={href} className="hover:underline">{name}</Link>
        </Heading>

        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-15 font-semibold tabular-nums">{formatPaise(line.price_paise)}</span>
          {line.saving_paise !== null && (
            <>
              <span className="text-13 tabular-nums text-faint line-through">{formatPaise(line.price_at_save_paise)}</span>
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-12 font-semibold text-ok">
                {formatPaise(line.saving_paise)} less than when you saved it
              </span>
            </>
          )}
        </p>

        <div className="mt-1.5">
          {line.in_stock ? <Badge tone="resolved">In stock</Badge> : <Badge tone="urgent">Out of stock</Badge>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {line.needs_choice ? (
          <ButtonLink href={href} variant="secondary" size="sm">Choose options</ButtonLink>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!line.in_stock || pending}
            pending={doing === "move"}
            onClick={() => run("move")}
          >
            Move to basket
          </Button>
        )}

        <button
          type="button"
          aria-label={`Remove ${name} from your wishlist`}
          title="Remove"
          disabled={pending}
          aria-busy={doing === "remove" || undefined}
          onClick={() => run("remove")}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line-strong bg-card text-muted transition-colors duration-(--duration-fast) hover:bg-err-soft hover:text-err disabled:opacity-50"
        >
          <IconTrash className="size-4" />
        </button>
      </div>
    </Card>
  );
}
