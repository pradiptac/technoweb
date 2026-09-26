# Where this CMS could go next — 2026-09-20

Written after the pending list was worked through (0.70.0). Nothing in the
brief is unbuilt, so these are additions rather than gaps, each checked
against what the code already has so a suggestion is not a thing that exists
under another name. Sized as **S** (a day), **M** (a few days), **L** (a
week or more). Ordered by how much they would change for the people who use
the product every day — the desk, the editors, the client's customers —
rather than by how interesting they are to build.

One correction to make first, wherever the brief is quoted: `CLAUDE.md`'s
"Scope limits" still says *no cart, checkout, payments*. The store shipped
with all three at the client's request; the paragraph predates it and reads
as a rule the code breaks. It should say what the scope is now.

## For the support desk

1. **Canned replies** (S). The ticket reply box has no saved wording; the
   email templates module already holds editable copy per message and the
   pattern for "use my wording". A small table of named snippets a support
   engineer can insert, with `{{customer.name}}` and `{{ticket.reference}}`
   substituted by the same personaliser the newsletter uses. Most desks
   answer the same twenty questions.
2. **Ticket merge** (M). Email-to-ticket opens a new ticket when a customer
   writes in without the reference; the second thread about one problem is
   now the ordinary case. "Merge into TW-…" moves the messages and
   attachments, writes a redirect event on the source, and tells the
   customer once. The ledger's Message-ID dedupe is the precedent for
   "one thing, twice".
3. **SLA per customer** (M). The SLA clock is one setting. Contracts differ
   — an AMC customer bought four hours, a walk-in gets next day — and
   `customers` already carries the company and the address the checkout
   uses. A `response_hours`/`resolution_hours` pair on the customer (null =
   the default) and the dashboard's medians split by it.
4. **Staff two-factor** (M). Sign-in codes made the mailbox the only factor
   for the console, and `docs/auth.md` says so as a reduction taken
   knowingly. A TOTP secret on `users` with a recovery-code list restores a
   second factor for `admin` without touching the customer portal; the
   sign-in code path already has the "second step" UI shape to reuse.
5. **Sessions and remote sign-out** (S). "Your account" cannot see where
   else it is signed in. Sanctum tokens carry `last_used_at` and a name;
   list them, revoke one. The activity log already records the sign-in.

## For editors

6. **Content revisions** (M). The media library keeps ten versions per
   file and can restore one; a blog post, a page or a solution keeps
   nothing — the last save is the only save. A `revisions` table written by
   `WritesCmsEntities` on every update (title, body, seo, who, when), a
   "History" tab on the ten entity forms, restore as a new save. The rule
   the media module wrote — archive *before* the edit — applies verbatim.
7. **Draft preview links** (S). A draft is invisible until it is published;
   an editor previews by publishing. A signed, expiring URL
   (`/preview/blog/<id>?sig=…`, the shape the order page's token already
   uses) that renders the record through the real page template, `noindex`,
   for the person asking "does this look right" — including the client, who
   has no console login.
8. **Editorial workflow** (M). `status` is `draft` / `published` /
   `archived`; there is no "ready for review". A fourth state and a
   `content_manager` who can write but not publish (a role, or a flag on
   the account) is what a two-person marketing team asks for within a
   month. The dashboard's "new since" poll would carry "awaiting review".
9. **Bulk actions on the list screens** (S). The ticket queue has a
   selection bar and a bulk endpoint; the sixteen CMS lists do not. Publish,
   unpublish, archive, delete for the selected rows, through the same
   `ids[]`-with-`refused[]` shape `POST /admin/tickets/bulk` returns.
10. **Catalogue import and export** (M). Products come in one form at a
    time. The store's stock and sales exports and the newsletter's CSV/XLSX
    importer (`Spreadsheet`, magic-byte sniffing, dry run then commit) are
    most of the machinery; a product import with the same dry-run screen is
    how a distributor's 400-line price list gets in.
11. **Image focal point** (S). `CoverField` takes `fit`; a card crops the
    centre. A focal point stored with the media row (the alt text's
    precedent: a property of the file) and `object-position` from it on
    every `next/image` — one number pair that stops faces being cut off in
    every tile of every theme.
12. **Per-category cookie consent** (S). The banner is accept/reject for
    everything; the EU-style "analytics / marketing" split is what a GDPR
    review asks for first. `lib/consent.ts` already holds one choice in
    `localStorage`; two flags and the Meta pixel gated on the second.

## For the client's customers

13. **Back-in-stock notices** (M). A product out of stock has a dead Buy
    button and nothing to leave behind. An email field on that state, a
    `stock_notices` table, and a job that fires from `StockLedger` when the
    level crosses zero upward — the newsletter's suppression list is
    consulted first, because a notice is still an email.
14. **Saved items** (S). `sessionStorage` compare tray is the precedent;
    a signed-in customer's list on the server (`customer_saved_products`),
    shown on the portal dashboard, is the portal's first reason to visit
    that is not a ticket.
15. **Generated invoices** (M). The order invoice is uploaded by hand
    (`docs/store.md`: "The invoice is uploaded, never generated"). That was
    the right first decision — a GST invoice's numbering and fields are a
    compliance matter — but every order already snapshots its lines, GST and
    addresses, and a PDF from a template with a sequential invoice number
    per financial year is what the desk types by hand today.
16. **Knowledge base feedback with words** (S). "Was this helpful?" is a
    count. A one-line "what were you looking for?" on a *no*, filed the way
    the assistant's unanswered questions are and drafted into an article by
    the same `ArticleBrief`, is the second source that list should have.

## For the marketing team

17. **Resend to non-openers** (S). A/B testing built the machinery: held
    recipients, a variant, a second subject. "Resend to everyone who did not
    open after N days, with a new subject" is the same pieces in a different
    order, and it is the most-asked newsletter feature after A/B.
18. **Automation sequences** (L). A welcome series for a new subscriber
    (day 0, day 3, day 10). Campaigns, groups, the scheduler and the
    suppression check exist; what is missing is a `sequence` with steps and a
    per-subscriber cursor. Large because the report shape changes.
19. **GA4 read-only, like Search Console** (M). The overview reads Search
    Console with a service account and no SDK; GA4's Data API takes the same
    credential. Page views and conversions beside clicks and impressions on
    `/admin/seo`, and the store dashboard's "views → orders" funnel, which
    today is `null` because nothing counts a view.
20. **Outgoing webhooks** (M). A lead, an order, a ticket — the client's
    CRM or accounting will want to be told. One `webhooks` table (URL,
    secret, events), a signed POST from the same `Notifier`-style guard that
    never fails the request, retries through the queue, a delivery log on
    the screen. The bounce webhook's HMAC-over-body is the signing precedent.

## Platform

21. **S3-compatible media disk** (S). The public disk is local; Plesk's
    disk is the site's disk. Laravel's `s3` driver with a CDN in front is
    configuration plus the `?v=` versioning already on every URL; the
    in-place edit's "same path" rule holds because the path is the key.
22. **Meilisearch when the catalogue is five figures** (M). Already
    written down in `API.md` as the ceiling of LIKE search. Not before.
23. **Hindi and Bengali** (L). Nothing is translated and nothing is
    designed for it; every string is in code or in settings. Worth naming
    because it is the one item here that touches every file, so it should
    be decided rather than drifted into.

## Not suggested, and why

- **Quotations and renewals** — the brief excludes them explicitly
  (`CLAUDE.md`, "Scope limits"). The lead pipeline is where a quotation
  request lands, and it stops there by design.
- **A page builder** — `pages.blocks` exists for it and is deliberately not
  accepted by the API ("raw JSON here would let a typo corrupt a page
  invisibly"). Twelve themes and a rich-text editor cover what a marketing
  site needs; a block builder is a second CMS inside the first.
  **Reversed 2026-09-26, at the client's request**: built as a *section*
  builder, not a canvas — every section a set of fields validated by its
  type, so the typo this note feared is a 422 on the field, not a corrupted
  page. See `docs/page-builder.md`.
- **Live chat with a human** — the assistant hands off to WhatsApp, which
  is where this client's customers already are.
