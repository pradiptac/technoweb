# Phase 2 — abandoned baskets, messaging channels, wishlist

The client asked on 2026-09-24 for three things that meet in one place: a
customer being told something on a channel they chose. They are built as
three streams in parallel (A, B, C) against the contract below, and merged in
the order C, A, B.

## Decisions the client made (2026-09-24)

- Providers are **pluggable per channel**.
- Channels carry **order updates, basket reminders, ticket updates and
  broadcasts to opted-in people**.
- Push opt-in is offered to **site visitors and portal customers**.
- Basket reminders include **guests who typed an email at the checkout**.
- **Two** reminders; the second may carry a coupon.
- **Transactional messages anytime, promotional 9am–9pm IST** (editable).
- Templates and broadcasts are worked by **campaign managers and store
  managers**; provider keys stay **admin-only**.
- Wishlist for **guests and accounts, merged on sign-in**, feeding
  **back-in-stock and price-drop** messages.

## The contract (already on the branch)

| | |
|---|---|
| `App\Enums\MessageEvent` | the eight events, `label()`, `promotional()`, `placeholders()` |
| `App\Support\Messaging\MessageRecipient` | `customerId`, `phone`, `name`; `::customer($c)` |
| `App\Support\Messaging\Messenger::notify(MessageEvent, MessageRecipient, array $vars)` | a no-op until B lands; **A and C call it** beside their emails |
| `App\Support\Messaging\QuietHours` | `allows($at)`, `nextOpening($at)`; settings `messaging_promo_start/end` (B seeds them), 09:00–21:00 IST default |

Rules for every stream:

- **Email stays email.** Each event's email goes through `Notifier` and a
  `MessageCatalogueEntries` template, editable in Settings → Email
  templates. `Messenger` is the *other* channels, called beside it.
- A promotional email is sent **only while `QuietHours::allows()`**; the
  command that sends it simply runs again later.
- Nothing fails the request that caused it (`Notifier::guard` rule).
- Guest push is broadcast-only: event messages reach push through a
  customer's own subscriptions. Guests get email, and WhatsApp/RCS if they
  opted in with a number.

## A — abandoned baskets

Findings: `carts.customer_id` is never written and nothing merges on
sign-in; the checkout sends only `X-Cart-Token`; `Checkout.php` empties the
items after an order but keeps the row; `PruneCarts` deletes after 30 days
(daily 03:30) — reminder 2 must fall inside that.

- Migration on `carts`: `email`, `phone`, `contact_consent_at`,
  `reminders_sent` (tinyint), `last_reminded_at`, `recovered_order_id`
  (nullable FK orders, nullOnDelete), `restore_token` (64 hex, unique,
  nullable) — index what the command queries.
- `PATCH /cart/contact` (`X-Cart-Token`, throttled) — `email`, `phone`
  (the checkout's Indian-mobile rule); the checkout form saves them on blur
  through a debounced Server Action, with one line under the email field
  saying a reminder may be sent if the order is not finished. A signed-in
  customer's basket stamps `customer_id` (forward the portal Bearer from the
  Next server on basket calls, read with `$request->user('sanctum')`
  narrowed to `Customer`).
- `technoware:remind-abandoned-carts`, scheduled every ten minutes: baskets
  with items and a contact, idle past `store_cart_reminder_1_hours`
  (default 1) / `store_cart_reminder_2_days` (default 1, max 25 because
  of the prune), `recovered_order_id` null, address not on
  `newsletter_suppressions`, switch `store_cart_reminders_enabled` on
  (default **off**), `QuietHours::allows()` → reminder 1 then 2. Each is an
  email (`cart_reminder_1`, `cart_reminder_2` in the catalogue — **update
  every "N messages" count**) and a `Messenger::notify(CartReminder1|2, …)`.
  Reminder 2 carries `store_cart_reminder_coupon` when set and the coupon
  is still usable.
- Restore link `/store/basket/restore/{token}` (frontend route handler):
  `GET /cart/restore/{token}` answers the basket's cart token, the handler
  sets the httpOnly cookie and redirects to `/store/basket`. The token is
  the restore token, never the cart token itself.
- Checkout stamps `recovered_order_id` on the basket it ordered from (and
  only counts as *recovered* when a reminder had been sent); emptying the
  basket stops reminders; an unsubscribe link in the email adds the address
  to the suppression list through the newsletter's existing route.
- Store → Settings gains the switch, two delays and the coupon
  (`store` group, `settings-copy.ts`, `SettingsScreensTest`); the store
  dashboard gains `recovered` (baskets reminded, recovered, revenue) —
  null, never zero, when nothing was reminded.
- Tests: the command's selection (idle, contact, suppression, switch,
  quiet hours, recovered, prune window), the contact endpoint, restore,
  recovery stamping, the coupon rule.

## B — messaging channels (WhatsApp, RCS, push)

- `App\Enums\MessageChannel` (`whatsapp`, `rcs`, `push`) and a provider enum
  per channel on the `MailTransport` model — label, blurb, fields,
  `isAvailable()`: WhatsApp {`meta_cloud`, `gupshup`, `twilio`}, RCS
  {`google_rbm`, `gupshup`}, push {`fcm`}. One `ChannelProvider` contract
  (`send`, `test`, `syncTemplates` where the channel has approval), one
  class per provider, Laravel's HTTP client only — no SDK. Google RBM and
  FCM HTTP v1 reuse `GoogleServiceAccount` (parameterise its setting key).
- Settings: a **private** `messaging` group (provider choice per channel,
  credentials `is_secret`, blank = unchanged, the quiet-hours pair) and a
  **public** `push` group for the Firebase web config (apiKey, projectId,
  messagingSenderId, appId, vapidKey — public by nature). Admin-only
  screen under Settings with a per-provider "Send a test" (throttled, the
  mail test's rules: a fixed body, to a number/token the admin types).
- `App\Support\Phone::e164()` — Indian mobiles to `+91…`, anything already
  `+…` kept, junk → null. Unit-tested.
- `message_templates`: channel, key, name, body with `{{placeholders}}`,
  header/media path, buttons/suggestions (JSON **list**), push title/image/
  link, WhatsApp category + language + provider template name + approval
  status synced from the provider. Console editor with a live phone-style
  preview, placeholder chips from `MessageEvent::placeholders()`, "Submit
  for approval" (WhatsApp), "Send a test". Filled with
  `Placeholders::fillText` (plain text, no escaping).
- `message_automations`: event × channel → template, on/off. Messaging →
  Automations is a table of the eight events.
- `message_contacts`: channel, address (E.164 or FCM token, unique per
  channel), customer_id?, opted_in_at, source, opted_out_at. Opt-in
  checkbox on the checkout and the portal profile (WhatsApp/RCS, the number
  typed there); push opt-in is a small bell in the store strip and the
  portal header that asks for browser permission only when pressed, never
  on load, after the analytics consent choice when a banner is shown;
  `public/firebase-messaging-sw.js` gets its config from a route handler.
  Opt-out: provider STOP webhooks (signed, answer 200 always, fail closed
  without a secret — the bounce-webhook rule), push `UNREGISTERED` revokes
  a token, and a portal toggle.
- `Messenger::notify()` implemented: resolve automations for the event,
  contacts for the recipient (phone → WhatsApp/RCS, customer → push),
  queue one `SendChannelMessage` per contact (`afterCommit`), delayed to
  `QuietHours::nextOpening()` for a promotional event, `message_deliveries`
  row per send with status from provider webhooks. Fire points: OrderPlaced
  `Checkout.php`, OrderPaid `Settlement.php` + `ManualPayment.php`,
  dispatched `Admin/Store/OrderController.php`, customer-visible ticket
  reply `Admin/TicketController.php` (**never an internal note**).
- **Broadcasts**: template + audience (a channel's opt-ins, portal
  customers, a newsletter group mapped by customer, wishlist holders of a
  product — that last source reads C's `wishlist_items` once merged, so
  build the audience resolver with a case that is a no-op until the table
  exists), schedule, batches (the `SendCampaignBatch` pattern), report.
  Claimed with a conditional UPDATE. Promotional → quiet hours.
- Roles: templates, automations and broadcasts are
  `role:campaign_manager,store_manager` (check `EnsureUserHasRole` takes a
  list); provider settings `role:admin`. Nav rows + `AdminNavRolesTest`.
- CSP: `connect-src` gains `fcmregistrations.googleapis.com
  firebaseinstallations.googleapis.com`; push only loads the Firebase SDK
  after the bell is pressed (dynamic import).

## C — wishlist

- `wishlists` (token 64 hex like the basket, `customer_id` nullable) and
  `wishlist_items` (wishlist_id, store_product_id, variation_id nullable,
  `price_at_save` paise, notified flags/stamps for back-in-stock and price
  drop), unique per (wishlist, product, variation).
- API `GET /wishlist`, `POST /wishlist/items`, `DELETE
  /wishlist/items/{item}`, `POST /wishlist/items/{item}/move-to-basket`;
  `X-Wishlist-Token` through the Next server in an httpOnly cookie like the
  basket; a portal Bearer attaches the wishlist to the customer, and signing
  in **merges** the guest wishlist into the account's (merge on the first
  authenticated request carrying both, and on `/auth/login`/`verify-code`
  if the token is forwarded). A line in somebody else's wishlist is a 404.
- Heart toggle on store product cards and the product page (client island,
  optimistic, announces `tw:wishlist`, `aria-pressed`, 24px+ target), a count
  in the store strip (the basket indicator's pattern: rendered empty on the
  server, filled after mount, so the shop stays cached), `/store/wishlist`
  page (move to basket, remove, empty state), and a Wishlist tab in the
  portal.
- Back in stock: when `StockLedger::record()` puts a product back on the
  shelf, a job tells each wishlist holder once (email template
  `wishlist_back_in_stock` + `Messenger::notify(WishlistBackInStock, …)`),
  re-arming when it goes out again. Price drop: when a store product's or
  variation's `price_paise` falls below an item's `price_at_save` by at
  least `store_price_drop_min_percent` (default 5), once per drop
  (`wishlist_price_drop` + `Messenger::notify(WishlistPriceDrop, …)`).
  Both only to an **account holder or a guest wishlist with an email** —
  a guest wishlist with no address is told nothing; the `/store/wishlist`
  page offers "email me about these" for that case. Both respect
  `QuietHours` and the suppression list.
- Store dashboard: most-wished products (top five).
- Tests: token scoping, merge, move-to-basket, back-in-stock once and
  re-arm, price-drop threshold and once-per-drop, quiet hours, suppression.

## Shared files — who owns what

Each stream appends to these; conflicts are resolved at merge:
`types/api.ts`, `mock-api.mjs`, `API.md`, `CLAUDE.md` (one module line
each), `routes/api/public.php`, `MessageCatalogueEntries` (**counts**),
`SettingsSeeder`, `settings-copy.ts`, `nav-items.tsx`, `AdminNavRolesTest`,
the checkout form (A: contact on blur; B: the opt-in checkbox), the store
strip (C: wishlist count; B: the push bell).
