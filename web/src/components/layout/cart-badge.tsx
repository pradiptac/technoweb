import { IconCart } from "@/components/icons-ui";

/** The cart glyph on a brand disc, beside the Store link in the header and the drawer. */
export function CartBadge({ size }: { size: number }) {
  const CartIcon = IconCart;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 cart-catch"
      style={{ width: size, height: size }}
    >
      <CartIcon className="text-brand-on" style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}
