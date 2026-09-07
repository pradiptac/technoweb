/** How many days a product counts as "New" on the storefront. */
export const NEW_PRODUCT_DAYS = 30;

/**
 * Whether a product was created recently enough to carry the New ribbon.
 *
 * A fixed constant rather than a setting — a single presentation threshold
 * nobody needs to tune per deploy, the same reasoning that keeps the trust
 * strip static rather than settings-driven.
 *
 * Named `store-product`, not `store` — `lib/store.ts` already exists
 * (`server-only`, orders and payments) and this has to be importable from a
 * client component (`StoreProductCard`'s `QuickView`/`QuickAdd` children),
 * so it cannot live in the same module without poisoning it for the client.
 */
export function isNewProduct(createdAt: string, days: number = NEW_PRODUCT_DAYS): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}
