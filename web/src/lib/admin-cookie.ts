/**
 * The staff session cookie's name, in a module with no directive.
 *
 * `lib/admin-auth.ts` is `server-only` and reads the cookie's value; the
 * proxy and the coming-soon page only need to know whether one is present,
 * and the proxy cannot import a `server-only` module that pulls in the API
 * client. One name, so the three cannot drift.
 */
export const ADMIN_COOKIE = "tw_admin_session";
