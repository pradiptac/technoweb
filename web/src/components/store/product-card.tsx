import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { IconBox } from "@/components/icons";
import { formatPaise } from "@/lib/money";
import type { StoreProduct } from "@/types/api";

/**
 * One line in the shop.
 *
 * The price is the price paid — GST is already in it, which the listing says
 * once rather than on every card. Three things are always visible because all
 * three are terms of the sale and the buyer should not have to open the page to
 * find them: what it costs, whether it can be had, and whether it can be sent
 * back.
 */
export function StoreProductCard({
  product, headingLevel = 3,
}: {
  product: StoreProduct;
  /**
   * A card under a section heading is an h3; a card in a listing whose h1 is
   * the page title is an h2. Getting this wrong is a heading-level jump, which
   * the audit fails on.
   */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  const discounted = product.compare_at_paise && product.compare_at_paise > product.price_paise;

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card">
      <Link href={`/store/products/${product.slug}`} className="block">
        {/*
          A fixed-height well, like every other image on the site: a slow image
          cannot then move the price out from under somebody's cursor.
        */}
        <div className="grid h-44 place-items-center overflow-hidden border-b border-line bg-surface p-4">
          {product.images?.[0] ? (
            <Image
              src={product.images[0]}
              alt={product.image_alts?.[0] ?? ""}
              width={280}
              height={160}
              className="max-h-full w-auto object-contain transition-transform duration-300 group-hover:scale-[1.03]"
              unoptimized
            />
          ) : (
            <span className="text-faint"><IconBox /></span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start gap-2">
          {product.brand && (
            <span className="text-[12.5px] font-semibold uppercase tracking-[.05em] text-muted">
              {product.brand.name}
            </span>
          )}
          {!product.in_stock && <Badge tone="urgent">Out of stock</Badge>}
        </div>

        <Heading className="text-[15px] font-semibold leading-snug">
          <Link href={`/store/products/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </Heading>

        {product.short_description && (
          <p className="line-clamp-2 text-[13px] text-muted">{product.short_description}</p>
        )}

        <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-1">
          <span className="text-[18px] font-semibold tabular-nums">{formatPaise(product.price_paise)}</span>
          {discounted && (
            <span className="text-[13px] tabular-nums text-faint line-through">
              {formatPaise(product.compare_at_paise!)}
            </span>
          )}
        </div>

        {/*
          Said on the card, not only at the checkout. A term disclosed on the
          receipt is not a term anybody agreed to.
        */}
        {!product.returnable && (
          <p className="text-[12px] font-medium text-warn">Non-returnable</p>
        )}
      </div>
    </article>
  );
}
