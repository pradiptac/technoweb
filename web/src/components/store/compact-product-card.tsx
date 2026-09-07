import Link from "next/link";
import Image from "next/image";
import { IconBox } from "@/components/icons";
import { formatPaise, percentOff } from "@/lib/money";
import { CompactAdd } from "@/components/store/compact-add";
import type { StoreProduct } from "@/types/api";

/**
 * The dense grid card for a category-listing page — a small pill "ADD" trigger
 * overlaid on the image's corner, no brand line, no short description, no
 * quick-view. A `variant` prop on `StoreProductCard` was considered and
 * rejected: an overlaid pill against a footer button, and a description slot
 * against none, is more branches inside one component than the two components
 * cost side by side.
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

        {/* The slot the mockup uses for pack size — real data, not invented. */}
        {product.brand?.name && (
          <span className="block truncate text-[11.5px] text-muted">{product.brand.name}</span>
        )}
      </div>
    </article>
  );
}
