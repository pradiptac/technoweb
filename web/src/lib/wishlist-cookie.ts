import "server-only";
import { cookies } from "next/headers";

/**
 * The guest wishlist's cookie, on its own so `lib/auth.ts` can forward it at
 * sign-in without importing `lib/wishlist.ts` — which imports `lib/auth.ts`
 * for the portal session, and a cycle between the two is one refactor away
 * from an `undefined` at module load.
 */
export const WISHLIST_COOKIE = "tw_wishlist";

export async function wishlistToken(): Promise<string | undefined> {
  const jar = await cookies();

  return jar.get(WISHLIST_COOKIE)?.value;
}

export async function clearWishlistToken(): Promise<void> {
  const jar = await cookies();

  jar.delete(WISHLIST_COOKIE);
}
