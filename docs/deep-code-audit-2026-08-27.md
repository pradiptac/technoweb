# Deep code audit — 27 August 2026

## Scope and method

Static review of the Laravel API and Next.js frontend, including authentication boundaries, request validation, file handling, redirects, CMS rendering, server actions, caching, and the current uncommitted landing-pages/locations feature set. No production requests were made and no supplied account was used.

## Findings

### High — related slug changes do not update landing-page paths or redirects

Landing-page paths are recomputed only in the landing page's `saving` event. Changing a Brand, ProductCategory, Service, Solution, or Location slug does not save its related landing pages. Composite URLs therefore remain stale and their intended old-to-new redirects are not created. The existing test masks this by manually calling `$page->touch()` after renaming the Brand.

Evidence: `api/app/Models/LandingPage.php:54-81`, `api/app/Models/Concerns/Sluggable.php:8-34`, and `api/tests/Feature/LandingPageTest.php:375-390`.

Recommendation: centralize path recomputation in a transaction and invoke it from the `updated` hook of every path constituent when its slug changes. Create the redirects there, then add API-level tests that rename each constituent without manually touching a landing page.

### Medium — location hierarchy can be made invalid through a partial update

`LocationRequest` only validates parent/level compatibility when `parent_id` is present. A request that changes just `level` skips the check against the stored parent. For example, a city beneath a state can be changed to `country`, leaving a tree that violates its own declared hierarchy.

Evidence: `api/app/Http/Requests/LocationRequest.php:76-97`.

Recommendation: calculate the effective parent and level from the request plus the stored model, and validate whenever either field is supplied. Add tests for level-only edits and parent-only edits.

### Medium — newly created published landing pages have no publication date

The create endpoint accepts `status: published`, but unlike the update endpoint does not set `published_at`. The page becomes publicly available with a null publication timestamp, violating the ordering/metadata invariant used elsewhere in the CMS.

Evidence: `api/app/Http/Controllers/Api/V1/Admin/LandingPageController.php:97-125`.

Recommendation: set `published_at` on create when the requested status is published, or move this invariant to one shared model/service method used by both create and update paths.

### Medium — no Content-Security-Policy is emitted

The frontend sends useful baseline headers (`nosniff`, frame protection, referrer policy, permissions policy), but no CSP. CMS HTML is server-sanitized, but it is rendered with `dangerouslySetInnerHTML`; the application also embeds inline theme and startup scripts. Without CSP, a sanitizer regression or a future unsafe sink has no browser-side containment.

Evidence: `web/next.config.ts:23-35`, `web/src/components/ui/prose.tsx:31`, and `web/src/app/layout.tsx:95-120`.

Recommendation: deploy a nonce-based CSP for frontend responses. Use the nonce for the two intentional inline blocks, restrict scripts/styles/images/connect sources to the application and required services, and begin with `Content-Security-Policy-Report-Only` to identify legitimate integrations.

## Positive controls observed

- Admin and portal tokens are stored in separate `httpOnly` cookies and are checked server-side.
- Admin, staff-role, and customer boundaries are enforced by dedicated middleware; customer ticket reads are scoped to the authenticated customer.
- CMS rich text is sanitized before persistence; anonymous form submissions are rendered as React text rather than HTML.
- SVG uploads are parsed and allowlist-sanitized before being written to public storage; the dedicated SVG test suite covers scripts, event attributes, `foreignObject`, URI vectors, styles, and XML entity attacks.
- Ticket attachments and CVs are stored on a private disk and downloaded as attachments after authorization.
- Public write endpoints have rate limits and honeypots where appropriate.
- SQL expressions reviewed use fixed SQL or parameter binding rather than interpolating request text.

## Validation performed

- `composer audit --locked` — passed; no known advisories for locked PHP dependencies.
- `php artisan test --compact` — passed: 223 tests, 733 assertions, 1 skipped.
- `php artisan migrate:status` — all 15 migrations applied to the configured database.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npm run themes` — passed all 15 themes and both schemes at WCAG AA.
- `npm run neon` — completed; it reports the intentional light-mode neon values as decorative rather than text-safe.
- `git diff --check` — no whitespace errors.

PHP 8.3.30 and Composer 2.9.4 were installed and verified during the follow-up audit. Browser audit scripts still require running frontend/API processes and were not run against a live system.

## Credential handling

Credentials supplied in chat were intentionally not used, recorded, or copied into this report. Because passwords were shared in a conversation, rotate both before any production use and move them into the approved secret-management channel.
