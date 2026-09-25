# Messaging channels — WhatsApp, RCS, browser push

Phase 2, stream B (2026-09-25). The client asked for a customer to be told
things on a channel they chose: order updates, basket reminders, ticket
replies, and broadcasts to people who opted in. Email stays email — every
event's email still goes through `Notifier` — and this module is the *other*
channels, called beside it through `App\Support\Messaging\Messenger::notify()`.

## The pieces

| | |
|---|---|
| `App\Enums\MessageChannel` | `whatsapp`, `rcs`, `push`: label, the provider enum, the setting that chooses it, `ready()`, address kind, `needsApproval()` (WhatsApp only) |
| `WhatsAppProvider`, `RcsProvider`, `PushProvider` | `meta_cloud`/`gupshup`/`twilio`, `google_rbm`/`gupshup`, `fcm` — label, blurb, `fields()`, `isAvailable()`, `client()`; the `MailTransport` shape |
| `Support\Messaging\Providers\*` | one `ChannelProvider` per provider: `send`, `test`, `syncTemplates`, `submitTemplate`, `challenge`, `verifyWebhook`, `webhookEvents`. Laravel's HTTP client only |
| `Support\Messaging\Messenger` | `notify(event, recipient, vars)` — a `message_deliveries` row per opted-in contact, one `SendChannelMessage` each, after commit |
| `Support\Messaging\ChannelSender` | sends one delivery row, re-checking everything at the moment of sending |
| `Support\Messaging\Contacts` | opt in, opt out, who an event reaches, `isStop()` |
| `Support\Messaging\Broadcasts` | the audience resolver, the claim, the report |
| `Support\Messaging\MessagingWebhook` | a provider's callback: status, STOP, template approval |
| `Support\Messaging\TemplateSync` | submit a WhatsApp template; read approvals back |
| `Support\Phone::e164()` | Indian mobiles to `+91…`, anything already `+…` kept, junk → null |

Five tables: `message_templates`, `message_automations` (event × channel,
unique), `message_contacts` (channel × address, unique), `message_broadcasts`,
`message_deliveries`.

## Rules, and why

**Nothing is sent without four things.** An enabled automation for the
event on the channel, a template that is sendable (WhatsApp: approved; RCS
and push: `not_required`), the channel `ready()` (provider chosen, available,
every credential saved), and an **active contact** — `opted_in_at` set,
`opted_out_at` null. `MessagingTest::test_nothing_is_queued_…` walks each
missing piece.

**Consent comes only from the person.** The checkout's box under the mobile
field, the portal profile's switches, the push bell. No console route creates
a contact; staff can only *record* an opt-out said elsewhere. A staff member
viewing as a customer ("View as") can switch a channel off and never on, and
the bell is not drawn for them. The contact row is the consent record: an
opt-out stamps it and keeps it.

**A phone channel is reached by the number the caller holds**, the one typed
at the checkout — that is who the order is for. Only when the caller has no
number are the customer's own opted-in numbers used. Push reaches a customer's
own browsers only; a guest's push token is broadcast-only (the contract's rule).

**Promotional waits, transactional does not.** `MessageEvent::promotional()`
decides; a promotional delivery is queued with a delay to
`QuietHours::nextOpening()`, and `ChannelSender` checks the window again when
it runs (a job queued at 8:59pm and reached at 9:01 puts itself back).
Broadcasts are always promotional. The window is `messaging_promo_start/end`
(09:00–21:00 IST, seeded) and is the same one the reminder emails keep.

**After the caller's commit, and never failing it.** `notify()` is wrapped in
a try and logs at `warning`; the job is dispatched `afterCommit()`, so a
checkout that rolls back has told nobody about an order that does not exist.
When nothing drains the queue a transactional message is sent after the
commit instead — `Notifier`'s rule, for the incident that produced it.

**Re-checked at the moment of sending.** A delivery can wait hours for the
window: the contact may have opted out, the template lost its approval, the
channel been switched off. Each is `skipped` with the reason — not `failed`,
since nothing was attempted. Only `pending` rows send, which is the guard
against a job run twice (`$tries = 1`, the campaign batch's reasoning).

**A status only moves forward.** `MessageDeliveryStatus::rank()` —
callbacks arrive out of order and a late `delivered` must not undo `read`.

**Webhooks: 200 always, fail closed.** `POST|GET
/messaging/webhooks/{channel}/{provider}`, un-throttled like the payment and
bounce webhooks. Meta verifies `X-Hub-Signature-256` with the app secret (and
answers its GET handshake with the verify token); Twilio its
`X-Twilio-Signature` (HMAC-SHA1 over the URL and sorted fields); Google RBM
`X-Goog-Signature` (HMAC-SHA512 of the decoded `message.data` with the client
token, plus the `{clientToken, secret}` echo); Gupshup signs nothing, so both
Gupshup providers require `messaging_webhook_secret` as `?token=` on the URL.
No secret configured accepts nothing: a forged STOP would opt people out in
silence — the bounce webhook's argument.

**STOP opts out.** `Contacts::isStop()` — STOP, STOP ALL, UNSUBSCRIBE,
CANCEL, END, QUIT, OPT OUT, STOP PROMOTIONS, punctuation ignored; "please stop
by tomorrow" is a reply. There is no START: re-opting in is the checkbox.

**FCM `UNREGISTERED` revokes the token.** The contact is opted out with
`unregistered`; that browser will never deliver again. A Google RBM 404 (the
phone cannot receive RCS) is a failure for that message, not an opt-out.

**A credential refusal is a banner.** A 401/403 from a provider writes
`messaging_<channel>_error` (the `mail_error` pattern); a later success — a
send or the settings test — clears it.

**Templates are plain text.** Filled with `Placeholders::fillText`; nothing
on these channels renders HTML, so nothing is escaped or sanitised.
WhatsApp templates are **named-parameter** at Meta (`parameter_format:
NAMED`), so `{{order_number}}` is submitted and sent under that name; Gupshup
and Twilio are numbered, so the body is renumbered in order of first use
(`MessageTemplate::positionalBody()`) and values sent in that order. Gupshup
sends by its template **id** and Twilio by its Content SID, which a sync
stores in `provider_template_id`. **Editing a WhatsApp template's reviewed
fields after submission puts it back to draft** — Meta's copy is the old
wording.

**Placeholders come from the event.** `MessageEvent::placeholders()` plus
`customer_name`, `first_name`, `site_name`. The editor's chips are that list;
its phone preview fills them with the API's `meta.samples` — the same values a
template test send and a provider's review example use (`Samples`).

**Broadcast audiences are narrowed to opt-ins on the channel.** Everybody
opted in; portal customers (active accounts only); a newsletter group
(active subscribers, matched to customers by email); wishlist holders of a
store product — **a no-op until stream C's `wishlist_items` exists**
(`Schema::hasTable`), then `wishlist_items.store_product_id` joined to
`wishlists.customer_id`. Claimed with a conditional UPDATE from
draft/scheduled, frozen into delivery rows, sent in batches of 100 ten seconds
apart by `SendBroadcastBatch`. A send is refused (422, `errors.send`) on an
unapproved template, a channel off, or an audience of nobody. Scheduled ones
are picked up by `technoware:send-broadcasts` every minute. Cancelling stops
what has not gone (`skipped`).

## Roles

Templates, automations, broadcasts and contacts are
`role:campaign_manager,store_manager` (`routes/api/admin-messaging.php`) —
`EnsureUserHasRole` takes a list. Provider settings and the test send are
`role:admin`. The sidebar's `role` field accepts the same comma-joined pair
(`RoleGate` in `nav-items.tsx`), and `AdminNavRolesTest` compares it to the
middleware string as written.

## Push without the Firebase SDK

The contract named the Firebase SDK behind a dynamic import. What shipped is
**no SDK at all**: `lib/push-client.ts` (dynamically imported when the bell is
pressed) does the three things the SDK's `getToken()` does — a Web Push
subscription with the VAPID key, a Firebase installation
(`firebaseinstallations.googleapis.com`), and a registration that trades the
subscription for an FCM token (`fcmregistrations.googleapis.com`) — both hosts
in `connect-src`. `public/firebase-messaging-sw.js` handles `push` and
`notificationclick` itself (FCM delivers an ordinary Web Push message) and
reads its title/icon fallback from `/push/sw-config`, a route handler. Reasons:
the worktree's `node_modules` is shared with the main checkout, so a
dependency could not be added from here; and no third-party script loads in
the page or the worker. **Not yet driven against a real Firebase project.**

The bell sits in the store strip (after the basket) and the portal header.
Nothing is asked on load; where the cookie banner is drawn the bell waits
for that answer first. The server draws it inert and `useSyncExternalStore`
reads the stored token after hydration, so the shop stays cacheable.

## Not yet driven against real accounts

Every provider is tested against faked responses shaped from its published
API. The Gupshup RCS gateway's send is from Gupshup's RCS page; its delivery
report shape is not published, so the webhook reads the common fields
(`externalId`/`id`, `status`/`eventType`, `text` from `mobile`). Meta template
**image headers** are sent when the approved template has one, but
submitting one from here sends text headers only (Meta needs the image
uploaded through its resumable upload API first).
