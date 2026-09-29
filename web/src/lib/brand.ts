/**
 * The company this install belongs to, for places that cannot wait for the
 * settings.
 *
 * The product is sold under each customer's own name, so no page may say
 * whose it is in a literal. Where the settings are already to hand, the
 * company is `settings.company_name` (Settings → General) and that is always
 * preferred. This is the fallback for what is decided before any fetch — the
 * title template, a page's `export const metadata`, the structured data's
 * organisation name: `SITE_NAME` in the runtime environment, which the setup
 * wizard writes into `config/web.env` from the same answer it saved as
 * `company_name`. Read when the server runs, never inlined at build
 * (`lib/site-url.ts` explains why that matters for a portable build).
 *
 * Server code only: a client component is handed the name as a prop.
 */
export function brandName(): string {
  return process.env.SITE_NAME?.trim() || "Technoware";
}
