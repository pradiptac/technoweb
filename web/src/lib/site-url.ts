/**
 * The site's public origin, read when the server runs — never when it was built.
 *
 * It used to be `NEXT_PUBLIC_SITE_URL` read directly, and Next inlines every
 * `NEXT_PUBLIC_*` reference into the bundle at build time, server code
 * included. That tied a build to one site: every canonical, the sitemap, the
 * RSS feed and the embed snippets named whichever origin the build machine was
 * given. A release is now one build shipped to every install
 * (`release/build.sh`), so the origin is `SITE_URL` in the runtime
 * environment (`config/web.env`, loaded by `start.js`), which Next does not
 * inline. `NEXT_PUBLIC_SITE_URL` is still honoured as a fallback, so a
 * development machine and a server built the old way behave as before.
 *
 * No trailing slash, ever: every caller appends a path that starts with one.
 */
export function siteUrl(): string {
  const raw = process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";

  return raw.replace(/\/+$/, "") || "http://localhost:3000";
}
