/**
 * What the browser scripts share: where the site is, which public routes
 * exist, and how to get past the sign-in screen.
 *
 * `audit.mjs` and `perf.mjs` both need these, and `audit.mjs` cannot be
 * imported for them — it executes its whole run at module scope, so importing
 * it *is* running it. Lifted here instead. `mobile-audit.mjs` keeps its own
 * copies for now; its route list is shaped around viewport widths rather than
 * pages and is not the same list.
 *
 * Nothing in here launches a browser or touches the network at import time.
 */

export const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
export const ADMIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL ?? "staff@technoware.in";
export const ADMIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "mock-password";

export const PUBLIC_ROUTES = [
  "/", "/solutions", "/solutions/networking", "/services", "/services/web-hosting",
  "/industries", "/industries/manufacturing", "/products", "/products/switches",
  "/resources", "/blog", "/case-studies", "/knowledge-base", "/about", "/contact",
  "/team", "/clients", "/certifications",
  // The assistant links here when somebody with no account has a fault, and
  // nothing had ever loaded it on this audit -- `audit:mobile` covered it and
  // this did not, which is exactly the gap a hard-coded path lives in.
  "/support",
  // The two policy pages Merchant Center requires a shop to make reachable.
  "/returns", "/shipping",
  "/search", "/search?q=switch",
  // The 404 is a real page now, so it gets audited like one. See EXPECT_404.
  "/this-page-does-not-exist",
  "/careers",
  // The programmatic landing pages. The two indexes render an empty
  // state with nothing published, so they are safe to audit on any install;
  // /brands/cisco exists only when a landing page has been published for it,
  // which is why it is not in the default list.
  "/brands", "/locations",
  "/portal/login", "/portal/register", "/portal/register/check-your-email",
  "/portal/verify-email", "/admin/login",
  // The shop. `/checkout` needs a basket, which PREPARE fills first.
  "/store", "/cart", "/checkout",
  /*
    The embeddable form, which is a real public page and would otherwise be
    audited by nothing. It renders outside `(marketing)`, so it has none of the
    header, footer or type scale the rest of the site is checked with — which
    makes it exactly the kind of route a contrast or tap-target regression
    reaches unseen. `contact` is the seeded form; the route 404s for a form
    that has not opted in, so this is also a live check that it is still on.
  */
  "/embed/forms/contact",
];

/**
 * Switch a sign-in screen to its password form.
 *
 * A one-time code is the default way in now, so the first thing on both login
 * screens is an address field and a "email me a code" button -- and a run that
 * simply filled `#password` timed out for three minutes against a field that
 * was not there, then reported the failure as "discovery failed" on an
 * unrelated route.
 *
 * A browser check cannot use the code path: reading the code means reading the
 * mailbox. So it presses the switch and signs in the way it always did, which
 * still exercises the screen it lands on. If the button is absent -- an
 * install with `password_login_enabled` off -- there is nothing to press and
 * nothing this can do about it, so it says so rather than timing out.
 */
export async function switchToPasswordForm(page) {
  const toPassword = page.locator('button:has-text("Use your password instead")');

  if (await toPassword.count()) {
    await toPassword.first().click();
    await page.waitForSelector("#password", { timeout: 15000 });

    return true;
  }

  return (await page.locator("#password").count()) > 0;
}

/**
 * Drive the real staff sign-in form on the given page.
 *
 * Deliberately the form rather than an injected cookie: it means the login
 * screen is exercised on every run, and a broken one fails here instead of
 * showing up as two dozen unrelated route failures. The session cookie lands
 * in the page's context, so every other page on that context is signed in too.
 */
export async function signInAsStaff(page, { timeout = 180000 } = {}) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout });
  await switchToPasswordForm(page);
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout }),
    page.click('button[type="submit"]'),
  ]);
}
