import "server-only";
import { cookies } from "next/headers";

/**
 * An order's access token, kept out of every URL a page is rendered at.
 *
 * The token is what reads and pays one order, and it used to travel in the
 * page's own address — `/order/TWO-2026-0117?token=…` — on a page inside the
 * marketing layout, where Google Analytics and the Meta Pixel report
 * `location.href`. Every order confirmation was sending its key to two third
 * parties, and to whatever a `Referer` reached.
 *
 * Now a link carrying the token goes to `/order/{n}/open?token=…` (a route
 * handler, which renders nothing and loads no script), which puts the token in
 * an httpOnly cookie **scoped to that order's path** and answers 303 to the
 * clean `/order/{n}`. The page and its Server Actions read the cookie; the
 * browser's JavaScript never holds it, and the actions post to the page's own
 * path, so the cookie rides along.
 *
 * One cookie name, one per order by path: a request to `/order/A` is sent
 * `/order/A`'s cookie and no other, so two orders open in two tabs do not
 * collide — and `/order/AB` is not a match for a cookie at `/order/A`, since a
 * cookie path matches only at a `/` boundary.
 */

export const ORDER_COOKIE = "tw_order";

/** `TWO-2026-0117`, and nothing that could break out of a cookie path. */
const ORDER_NUMBER = /^[A-Za-z0-9-]{1,40}$/;

/** `bin2hex(random_bytes(32))` in `App\Models\Order`. */
const ORDER_TOKEN = /^[a-f0-9]{64}$/;

export function isOrderNumber(value: string): boolean {
  return ORDER_NUMBER.test(value);
}

export function isOrderToken(value: string): boolean {
  return ORDER_TOKEN.test(value);
}

export function orderPath(orderNumber: string): string {
  return `/order/${orderNumber}`;
}

/** Thirty days — long enough to come back and pay, and the email has the link. */
export function orderCookieOptions(orderNumber: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: orderPath(orderNumber),
    maxAge: 60 * 60 * 24 * 30,
  };
}

/** Set the cookie from a Server Action (the checkout). */
export async function rememberOrderToken(orderNumber: string, token: string): Promise<void> {
  if (!isOrderNumber(orderNumber) || !isOrderToken(token)) return;

  (await cookies()).set(ORDER_COOKIE, token, orderCookieOptions(orderNumber));
}

/** The token this browser holds for the order, or null. */
export async function orderToken(orderNumber: string): Promise<string | null> {
  if (!isOrderNumber(orderNumber)) return null;

  const value = (await cookies()).get(ORDER_COOKIE)?.value ?? "";

  return isOrderToken(value) ? value : null;
}
