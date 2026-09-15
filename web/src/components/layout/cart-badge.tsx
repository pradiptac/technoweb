import { IconCart } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

/**
 * The cart glyph on a brand disc, beside the Store link in the header and the
 * drawer. `className` is how the header raises it to a superscript — small,
 * at the word's top-right corner — where the drawer keeps it inline at 26px
 * beside a 56px row.
 */
export function CartBadge({ size, className }: { size: number; className?: string }) {
  const CartIcon = IconCart;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 cart-catch", className)}
      style={{ width: size, height: size }}
    >
      <CartIcon className="text-brand-on" style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}
