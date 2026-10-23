# API keys (0.189.0, C6)

The incoming half of integration. Webhooks tell another system something
happened; an API key lets that system **ask** for the same records and do three
small writes (file a lead, add a subscriber, set stock). Spec:
`docs/superpowers/specs/2026-10-23-api-keys-design.md`. Reference:
`API.md` "Integration API — API keys". Manual: `manual/39-api-keys.md`.

## The rules

- **Header only.** `Authorization: Bearer ak_…` and nothing else; never the
  query string. `AuthenticateApiKey` (alias `api.key`, `api.key:<scope>`) reads
  `$request->bearerToken()`. A Sanctum token is not a key.
- **Not Sanctum.** `ApiKey` is not a tokenable and never resolves as
  `$request->user()`; the middleware puts the key on the request as the
  `api_key` attribute and a controller reads it through
  `AuthenticateApiKey::key($request)`. `/ext` sits outside `auth:sanctum`.
- **Format and storage.** `ak_` + 40 characters of `[A-Za-z0-9]`; the first 11
  (`ak_` + 8) are the stored `prefix`; the whole key is kept only as `sha256`,
  unique-indexed, looked up by hash. Nothing can read a key back.
- **Shown once.** On the 201 that made it and on the roll that replaced it
  (`data.key`), and on no read. The console shows it in-page (a redirect would
  lose it), through `components/admin/secret-once`.
- **Scopes are enforced in middleware**, per route. `App\Enums\ApiScope` is the
  one list (nine scopes), sent as `meta.scopes` — never listed in TypeScript.
  A scope on a route that is not an `ApiScope` throws `LogicException`: it is a
  mistake in the route, never a 403 for ever. Laravel splits middleware
  parameters on `,` only, so `leads:read` arrives whole.
- **What a key reads is what a webhook is sent.** Every record is built by
  `App\Support\Webhooks\WebhookPayload`, so the two surfaces cannot drift and
  every withholding holds for both: no internal notes, no `status_note`, no
  `access_token`; a sensitive ticket's `description` and a sensitive message's
  `body` are `WebhookPayload::REDACTED`; a ticket read carries
  `publicMessages` only.
- **Every write goes through the one implementation the site already has**:
  `LeadIntake::fromApi()`, `SubscriberIntake::take(..., 'api')`,
  `StockLedger::adjusted(...)`. Never a raw insert.
- **One more thing a lead filed by a key is not**: a website conversion. It has
  `channel = 'api'`, `form_name = 'API: <key name>'`, the key as its source
  (morph alias `api_key`), and is **not** counted as a native-analytics
  enquiry conversion — an integration's lead is not a visitor's.
- **Limits.** 120 requests a minute **per key** (`RateLimiter` bucket
  `api-key:<id>`, not per route). Every request presenting a *recognised* key
  counts, refused ones included, so a revoked key cannot be hammered for free.
  Beside it the `/ext` group carries `throttle:240,1`, which under this
  project's `ThrottleRequestsPerRoute` counts **per route and per address**, not
  per group — it is what bounds an unknown key, which has no bucket of its own.
- **The request log** (`api_key_requests`): method, **path without the query
  string** (truncated to 255, the column's width), status, ip, duration, written
  in `terminate()` and guarded so a logging failure never fails the request.
  **No row for a 429** — a key over its limit would otherwise write unbounded
  rows. Pruned at 30 days by `technoware:prune-api-key-requests` (03:57).
  `last_used_at`/`last_used_ip` are updated only for a request that got through
  to the controller, at most once a minute per key, through the query builder
  so `updated_at` does not move. State travels on the request's attributes
  because `terminate()` runs on a fresh instance.
- **No admin request field may be named `key`.** `key` is on `ActivityLogger`'s
  context allowlist; the plain key must only ever travel *out*. Create, edit,
  roll, revoke and delete reach the activity log by its ordinary rules.
  `ApiKey` is fillable down to `key_hash` and `revoked_at`, so request input is
  never put into `create()`/`fill()` whole; the controller builds attributes
  field by field.
- **Roll** replaces the key under the same row (same scopes, log, name); the
  old key dies at once. **Revoke** is final and idempotent: a revoked key
  cannot be edited or rolled (422), a new one is made instead. **Delete**
  cascades the log.
- **Expiry and the allowlist.** `expires_at` is optional and must be in the
  future when set — but an *unchanged* expiry that has passed may be re-saved,
  since the console posts every field and renaming an expired key must not 422.
  `allowed_ips` is one address or CIDR range per line (`IpUtils` against
  `$request->ip()`, which honours `TRUSTED_PROXIES`); a bad line is refused,
  named.

## Lists

`GET /ext/<resource>`: `?since=` is **ISO 8601 only** — a plain `Y-m-d` is the
start of that day in the app timezone — and is read as an instant whatever its
offset (an offset other than the app's is converted, not ignored); anything
else, including `yesterday`, is a 422. `?per_page=` 1–100, default 50. Ordered
`updated_at, id` ascending so an integration pages forward and resumes from the
last `updated_at` it saw. An unknown `?status=`, or an array in its place, is
ignored (the integration gets everything rather than an error). `ExtList` is
the one implementation.

## Writes

- **Lead** (`leads:write`): `name?`, `email`/`phone` (at least one),
  `company?`, `subject?`, `message?`. 201 with the lead.
- **Subscriber** (`subscribers:write`): through `SubscriberIntake`, so a
  suppressed address is `outcome: suppressed`, `data: null`, **never
  re-subscribed**; a known one is only enriched; `group_ids` naming the
  "Existing customers" group (`source = customers`) are refused — it is derived,
  not curated.
- **Stock** (`stock:write`): `PUT /ext/store/stock {items: [{sku, stock}]}`, 1–100,
  no SKU twice. Each SKU is resolved to a variation first, then a product, each
  in its own transaction; the level is written and recorded through
  `StockLedger::adjusted()` with source `API key "<name>"`. Refused **per item**
  (never stopping the rest): no row has the SKU, the SKU is on two rows, the
  product is not physical or does not track stock, or it is a **variated
  product's own SKU** (its level is never read — set stock on an option's SKU).
  200 `{updated: [sku], refused: [{sku, message}]}`.

## Console

System → API keys (`/admin/api-keys`, `role:admin`, beside Webhooks): list, new,
edit with the secret-once panel after create and roll, Revoke/Roll/Delete with
confirmations, a copyable `curl` example from the base URL and the key's first
scope, and a 30-day request chart with a recent-requests table. The sidebar row
and `ScreenAccess` are one change (`AdminNavRolesTest` compares them). "On a
date" with the date blank is a field error on `expires_at`, never a key with no
expiry saved in silence.

## Not done, on purpose

Reaching `/admin/*` with a key; OAuth apps or customer-made keys; writes beyond
the three; a developer portal. Each is a decision about what an outside system
may change and can be added one scope at a time.
