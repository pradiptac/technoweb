import Link from "next/link";
import Image from "next/image";
import { IconBox } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { formatPaise, percentOff } from "@/lib/money";
import { CompactAdd } from "@/components/store/compact-add";
import { QuickView } from "@/components/store/quick-view";
import type { StoreProduct } from "@/types/api";

/**
 * The dense grid card for a category-listing page — a small pill "ADD" trigger
 * overlaid on the image's corner and no short description. A `variant` prop on
 * `StoreProductCard` was considered and rejected: an overlaid pill against a
 * footer button, and a description slot against none, is more branches inside
 * one component than the two components cost side by side.
 *
 * It carries the quick view now, which it did not: the eye was on the full card
 * only, so the listing people actually browse a category through was the one
 * where a product could not be looked at without leaving the grid. Bottom
 * right, on the row with the brand, rather than floating over the photograph —
 * that corner already holds the ADD pill, and two overlaid controls two
 * millimetres apart on a picture is how somebody buys a laptop meaning to look
 * at one.
 *
 * The image well is the **same 4:3 as the full card's**, deliberately. It was
 * square here and 6:5 there, so a product changed shape as somebody moved
 * between the two listings — the one thing about a card that should not depend
 * on which page it is being shown on.
 *
 * No star rating, no wishlist heart — same reason as `StoreProductCard`: no
 * rating data exists anywhere in this product, and inventing one would be
 * the fabrication this codebase consistently refuses elsewhere.
 */
export function CompactProductCard({ product, priority = false }: { product: StoreProduct; priority?: boolean }) {
  const discounted = Boolean(product.compare_at_paise && product.compare_at_paise > product.price_paise);

  return (
    <article className="group overflow-hidden rounded-lg border border-line-strong bg-card">
      <div className="relative">
        <Link href={`/store/products/${product.slug}`} className="block">
          <div className="relative grid aspect-[4/3] place-items-center overflow-hidden border-b border-line bg-surface">
            {product.images?.[0] ? (
              /* Fills the well, exactly as the full card does — see its note. */
              <Image
                src={product.images[0]}
                alt={product.image_alts?.[0] ?? ""}
                fill
                sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 100vw"
                priority={priority}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                unoptimized
              />
            ) : (
              <span className="text-faint"><IconBox /></span>
            )}
          </div>
        </Link>

        {discounted && product.compare_at_paise && (
          <span className="absolute left-2 top-2 rounded bg-err-fill px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
            -{percentOff(product.price_paise, product.compare_at_paise)}%
          </span>
        )}

        {/* A sibling of the Link, not a child of it — see StoreProductCard. */}
        <CompactAdd product={product} />
      </div>

      <div className="p-2.5">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <b className="text-[14px] font-semibold tabular-nums">{formatPaise(product.price_paise)}</b>
          {discounted && (
            <span className="text-[11.5px] tabular-nums text-faint line-through">
              {formatPaise(product.compare_at_paise!)}
            </span>
          )}
        </div>

        <Link href={`/store/products/${product.slug}`} className="mt-0.5 block truncate text-[12.5px] text-ink hover:underline">
          {product.name}
        </Link>

        {/*
          The card's last row: who makes it, and a way to look at it without
          leaving the grid.

          The brand is a `Badge` rather than a muted line, and `tone="brand"` is
          the one that means what this is — its own comment says the tone is
          "for standing rather than state". `dot={false}` for the same reason,
          from the same file: the leading dot exists to make a column of
          *states* scannable, and a manufacturer is a label. It also earns its
          place on this screen specifically — a category listing is where
          somebody is comparing five near-identical laptops, and the maker is
          the fastest thing to sort them by.

          `min-w-0` on the badge and `truncate` on the name inside it: `Badge`
          is `whitespace-nowrap`, so a long manufacturer would otherwise set the
          row's floor and push the eye out of a 179px card. The truncation has
          to be on an element inside the badge — `Badge` is `inline-flex`, and
          `truncate` on a flex container does not ellipsise a bare text child.

          The eye is `ml-auto` rather than the row being `justify-between`, so
          it stays hard right on a card whose product has no brand recorded
          instead of drifting to the left edge.
        */}
        <div className="mt-1.5 flex items-center gap-2">
          {product.brand?.name && (
            <Badge tone="brand" dot={false} className="min-w-0 px-2 py-0.5">
              <span className="truncate">{product.brand.name}</span>
            </Badge>
          )}
          <div className="ml-auto">
            <QuickView product={product} size="sm" />
          </div>
        </div>
      </div>
    </article>
  );
}
