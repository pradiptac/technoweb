# Nine additions from `docs/feature-ideas-2026-09-20.md` — design

Approved 2026-09-20. Items 1, 2, 10, 11, 13, 17, 18, 19 and 20 of the
feature-ideas document, built in that order, one commit and one minor version
each (0.71.0 → 0.79.0). Plus the document's own first correction: the
Scope-limits paragraph in `CLAUDE.md` says what the scope is now.

Every item is built the way the rest of the codebase is: tests first, the
API's rules in PHP rather than in the console, `updateTag` on every console
save, the mock API kept in step with every response shape, `composer analyse`
clean, `tsc` and `lint` clean, and `npm run audit` over the routes an item
adds. `API.md` and the module's `docs/` file gain a line per rule.

## 1. Canned replies

- `canned_replies`: `title`, `body` (plain text — the reply box is a
  `Textarea`), `sort_order`, `created_by`. Shared across the desk.
- `/admin/canned-replies` CRUD, `role:support_engineer`.
- `GET /admin/tickets/{reference}/canned-replies` returns every reply with its
  placeholders **already filled for that ticket** through
  `Placeholders::fillText` — `customer_name`, `first_name`, `company`,
  `reference`, `subject`, `agent_name`. The console inserts text and never
  learns the placeholder rules; `EmailRenderer::personalise` is not used, for
  the reason its docblock gives.
- Console: "Insert saved reply" above the reply textarea, inserting at the
  cursor; management at `/admin/tickets/saved-replies`.

## 2. Ticket merge

- `POST /admin/tickets/{reference}/merge {into}`. 422 when the two are the
  same ticket, belong to different customers, the source is already merged,
  or the target is not in an open state.
- In one transaction: messages and attachments re-pointed at the target;
  `tickets.merged_into_id` set on the source; source → `closed` with
  `closed_at`; events `merged_into` (source) and `merged_from` (target); an
  internal note on the target naming the source and its subject.
- One `TicketMerged` notification to the customer, queued, in the message
  catalogue.
- Reads of a merged source (portal and console) answer 200 with
  `merged_into` (the reference) so the screens link to the target.
  Email-to-ticket follows `merged_into` when a reply quotes the old
  reference.
- Console: "Merge into…" on the ticket page listing the customer's other open
  tickets, plus a reference box. Redirects to the target with
  `?done=ticket-merged`.

## 10. Store catalogue import and export

- `GET /admin/store/products/export`: CSV through `Csv::write`, one row per
  product and one per variation (`parent_sku` filled), money as plain
  decimals in rupees. A plain `<a download>` on the products list.
- `POST /admin/store/products/import/analyse` (dry run, writes nothing) and
  `POST /admin/store/products/import` (commit), both through
  `Spreadsheet::read`; `Csv::guessMapping` learns the store's headers. A
  `store_product_imports` row records the file, the mapping, counts and the
  per-line problems.
- **Matching is by SKU.** A row whose SKU matches a variation updates the
  variation's price, compare-at, stock, GTIN, MPN; one matching a product
  updates the product's editable columns; an unmatched row creates a product
  (name and price required; category and brand by slug, refused when
  unknown). Import never creates a variation.
- Stock changes go through `StockLedger::adjusted` with an "import" note.
- Console: `/admin/store/products/import` — upload → mapping and counts →
  commit → done, the newsletter wizard's shape. `role:store_manager`.

## 11. Image focal point

- `media.focal_x`, `media.focal_y`: nullable 0–100; null is centre. `PATCH
  /admin/media/{id}` accepts them. The Edit dialog sets them by clicking the
  preview (a crosshair), with "Reset to centre".
- `MediaAlt` becomes `MediaMeta`: one map per request of path → `{alt,
  focal}`. Every resource emitting a `*_alt` emits `*_focus` beside it — the
  string `"30% 20%"` or null — and image arrays carry `image_focuses`
  parallel to `image_alts`. The public settings' derived `_path` map adds
  `_focus` for the banners.
- Frontend: `lib/focal.ts` → an `objectPosition` style, applied at the cover
  sites: `Tile`/`Card` media, `PageHero` banners, blog hero and grids,
  product and store cards, the slider.

## 13. Back-in-stock notices

- `stock_notices`: `store_product_id`, `store_product_variation_id`
  (nullable), `email`, `customer_id` (nullable), `token`, `notified_at`;
  unique on product + variation + email, re-armed by clearing `notified_at`.
- `POST /store/products/{slug}/notify {email, variation_id?, website}`:
  throttled 10/min, honeypot, **202 always**. A suppressed address is
  accepted and never written.
- Trigger: `StockLedger::record()` on a positive delta dispatches a queued
  `SendStockNotices(product, variation)`. The job re-checks `inStock()` when
  it runs, skips addresses on the suppression list, sends `BackInStock`
  (catalogue, with a cancel link at `GET /store/stock-notices/{token}/cancel`,
  idempotent) and stamps `notified_at`.
- Storefront: an email form on the out-of-stock state, prefilled for a
  signed-in customer. Console: `notices_waiting` on the admin product row, an
  `awaiting_stock` attention figure on the store dashboard linking to
  `?notices=1`.

## 17. Resend to non-openers

- `POST /admin/newsletter/campaigns/{id}/resend {subject}` on a `sent`
  campaign; 422 when it is not sent or already has a resend.
- A copy (the duplicate mechanics) with `resend_of_id` and the new subject.
  Its audience is the original's recipients with status `sent` and no open,
  re-filtered through the same eligibility (`AudienceResolver::freezeFrom`)
  and queued through `CampaignSender` with the health gate.
- The original's report shows "Resent to N non-openers" with a link; the
  resend's names its parent. Console: a panel on the report screen.

## 18. Automation sequences

- **Each step is a `newsletter_campaigns` row** — `sequence_id`,
  `sequence_position`, `delay_days`, status `automation` — so a step has the
  block editor, health checks, tracking, unsubscribe and a report already. A
  step send is a recipient row on that campaign. The campaigns index hides
  automation rows; `completeIfDone` skips them.
- `newsletter_sequences`: `name`, `status` (active/paused), trigger
  `newsletter_group_id` (null = every new subscriber), `from_name`,
  `from_email`, `reply_to`, `created_by`.
- `newsletter_sequence_enrolments`: sequence, subscriber, `next_position`,
  `next_at`, `status` (active/completed/cancelled), `enrolled_at`,
  `completed_at`; **unique per pair — once per subscriber, ever**.
- Enrolment: `SubscriberIntake` when a subscriber becomes an active member of
  a sequence's group, or becomes active for the group-less kind; manually
  from `POST /admin/newsletter/sequences/{id}/enrol {subscriber_ids[] |
  group_id}`.
- `technoware:run-sequences` every ten minutes: due active enrolments → a
  recipient row on the step campaign and a `SendCampaignBatch`, cursor
  advanced to the next step's `next_at`, or completed; a subscriber gone
  inactive or suppressed → cancelled.
- Console: `Sequences` in the newsletter nav — list, settings, steps
  (reorder; content through the campaign editor), enrolments (count,
  cancel), report per step.

## 19. GA4, read only

- The JWT/token exchange leaves `SearchConsole` for a shared
  `GoogleServiceAccount` (scope per caller).
- `App\Support\Seo\GoogleAnalytics`: `ga4_property_id` and `ga4_error` in
  `integrations`, the same service-account key; `pages()` cached an hour
  (28-day views and users by path), `test()`, `productViews(from, to)`.
- `/admin/seo` rows gain `analytics` beside `search`; `meta.analytics`;
  `?analytics=no_views`. Store dashboard `funnel.product_views` and
  `views_to_orders` — null when unconfigured. Settings → Integrations: the
  property field and a Test button (`POST settings/integrations/ga4/test`).

## 20. Outgoing webhooks

- `webhooks`: `name`, `url` (https), `secret` (encrypted, shown once on
  create), `events` (list), `is_active`, `created_by`, `last_delivered_at`,
  `last_error`. `webhook_deliveries`: `event`, `payload`, `status`,
  `attempts`, `response_status`, `response_excerpt`, `next_attempt_at`,
  `delivered_at`; pruned at 30 days.
- `WebhookEvent`: `ping`, `lead.created`, `ticket.created`,
  `ticket.replied`, `ticket.status_changed`, `order.placed`, `order.paid`,
  `order.status_changed`, `customer.registered`, `form.submitted`,
  `subscriber.joined`. Payloads are the admin resources' shapes.
- `Webhooks::emit(event, payload)`: guarded like `Notifier`, never fails the
  request; one delivery per subscribed active hook; `DeliverWebhook` job, 5
  attempts with backoff, 10s timeout; headers `X-Technoware-Event`,
  `X-Technoware-Delivery`, `X-Technoware-Timestamp`,
  `X-Technoware-Signature: sha256=` HMAC over `timestamp.body`.
- Called from the places the notifications already fire.
- Console: `/admin/webhooks`, `role:admin` — list, form with event
  checkboxes, "Send a ping", a delivery log with Redeliver.

## Decided

- Merge across customers is refused, not confirmable.
- A sequence enrols a subscriber once, ever.
- Item 10 is the store's catalogue only.
