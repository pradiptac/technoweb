# C6 — API keys (0.189.0)

The roadmap's C6. The user asked for sensible defaults and no questions
(2026-10-23), so every decision below is **Claude's call** unless it is a
rule this codebase already states.

## Intent

Webhooks (2026-09-20) are the outgoing half of integration: this site tells
another system that a lead, an order or a ticket arrived. API keys are the
incoming half: another system — the client's ERP, a CRM sync, a
spreadsheet script, a developer's integration — **asks** this site for the
same records, and does the handful of writes an integration genuinely needs
(file a lead, add a subscriber, set stock from the warehouse).

Today the only way in is a staff sign-in, which is a person's account, has
no scopes, dies with that person's password and logs every request as them.

## Goals

- An administrator creates a named key, chooses exactly what it may do, and
  sees the key once.
- An integration authenticates with `Authorization: Bearer <key>` and reaches
  a small, stable surface under `/api/v1/ext/*`.
- What a key reads is **what a webhook is sent**: every record is built by
  `App\Support\Webhooks\WebhookPayload`, so the two integration surfaces
  cannot drift and every withholding (no internal notes, no `status_note`,
  no `access_token`, a sensitive ticket redacted) holds for both.
- Every write goes through the one implementation the site already uses —
  `LeadIntake`, `SubscriberIntake`, `StockLedger` — never a raw insert.
- The console shows who used a key, when, from where and what it asked.

## Non-goals

- Reaching the console's own `/admin/*` routes with a key. Those routes, the
  role middleware and the activity log all assume a person.
- OAuth apps, per-customer keys, or keys a customer can create.
- Writes beyond the three named (no ticket replies, no order status, no
  content edits). Each is a decision about what an outside system may change
  and can be added one scope at a time later.
- A public developer portal. The reference is API.md and the manual chapter.

## Anti-goals

- A key that can do more than its ticks say. Scopes are enforced per route,
  in middleware, and an unknown scope on a route is a programming error.
- A key that can be read back. It is hashed at rest; the console can show
  only its prefix.
- A key whose use leaves no trace. Every request is logged.
- Breaking anything when there are no keys: no key, no `/ext` access, and
  nothing else changes.

## How a key works (Claude's calls)

- **Format.** `ak_` + 40 characters from `[A-Za-z0-9]` (`random_bytes`,
  base62). The first 11 characters (`ak_` + 8) are stored as `prefix` and
  shown in the console so two keys can be told apart; the whole key is
  stored only as `sha256`, unique-indexed, looked up by hash.
- **Shown once**, on the 201 that created it and on the response that
  rolled it — the webhook secret's rule, reusing the console's
  `secret-once` component.
- **Roll** mints a new key under the same row (same scopes, log, name); the
  old one stops at once. **Revoke** stamps `revoked_at` and keeps the row
  and its log; **delete** removes both.
- **Expiry**: optional `expires_at`. The form offers Never / 30 / 90 / 365
  days / a date.
- **IP allowlist**: optional, one address or CIDR range per line, checked
  with `Symfony\Component\HttpFoundation\IpUtils` against
  `$request->ip()` (which already honours `TRUSTED_PROXIES`). Validation
  refuses a line that is neither, naming it.
- **Scopes** (`App\Enums\ApiScope`, sent as `meta.scopes` with label and
  blurb, never listed in TypeScript):

  | Scope | Grants |
  |---|---|
  | `leads:read` | list and read leads |
  | `leads:write` | file a lead |
  | `orders:read` | list and read shop orders |
  | `customers:read` | list and read portal customers |
  | `tickets:read` | list and read tickets (public messages only) |
  | `subscribers:read` | list newsletter subscribers |
  | `subscribers:write` | add or update a subscriber |
  | `products:read` | list shop products with price and stock |
  | `stock:write` | set a shop product's or variation's stock by SKU |

- **Who manages keys**: `role:admin`, beside Webhooks under System — a key is
  the same class of decision (it hands every lead's telephone number to
  whoever holds a string).

## The `/ext` surface

All under `/api/v1/ext`, outside `auth:sanctum`, behind a new `api.key`
middleware alias taking the scope: `api.key:leads:read`. JSON only; send
`Accept: application/json`.

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/ext/me` | any valid key | `{name, prefix, scopes, expires_at}` — lets an integration check its own key |
| `GET` | `/ext/leads` | `leads:read` | `WebhookPayload::lead` rows |
| `GET` | `/ext/leads/{id}` | `leads:read` | |
| `POST` | `/ext/leads` | `leads:write` | `name`, `email`, `phone`, `company`, `subject`, `message` (at least an email or a phone), the public forms' page envelope (`_source_url`, `_utm_source`…). Files a lead with `channel = 'api'` through `LeadIntake::fromApi()`; source is the key. **201** with the lead |
| `GET` | `/ext/orders` | `orders:read` | `WebhookPayload::order` |
| `GET` | `/ext/orders/{number}` | `orders:read` | by order number |
| `GET` | `/ext/customers` | `customers:read` | `WebhookPayload::customer` |
| `GET` | `/ext/customers/{id}` | `customers:read` | |
| `GET` | `/ext/tickets` | `tickets:read` | `WebhookPayload::ticket` (sensitive descriptions redacted) |
| `GET` | `/ext/tickets/{reference}` | `tickets:read` | adds `messages` — **public messages only** (`publicMessages`), each through `TicketMessageResource`; a sensitive one's `body` replaced with `WebhookPayload::REDACTED`, never sent |
| `GET` | `/ext/subscribers` | `subscribers:read` | `WebhookPayload::subscriber` |
| `POST` | `/ext/subscribers` | `subscribers:write` | `email`, `first_name?`, `last_name?`, `company?`, `phone?`, `group_ids[]?` through `SubscriberIntake::take(..., source: 'api')`. 200 `{outcome, data}`; a suppressed address is `outcome: suppressed` with `data: null`, never re-subscribed |
| `GET` | `/ext/store/products` | `products:read` | a lean shape: `id, sku, name, slug, status, price_paise, compare_at_paise, track_stock, stock, in_stock, variations[{id, sku, name, price_paise, stock}]`, `updated_at` |
| `PUT` | `/ext/store/stock` | `stock:write` | `{items: [{sku, stock}]}` (1–100). Each SKU resolved to a variation first, then a product; the level written, the change recorded through `StockLedger::adjusted(..., source: 'API key "<name>"')`. 200 `{updated: [sku], refused: [{sku, message}]}` — the bulk-actions shape. Unknown SKU, an SKU on two rows, an untracked or non-physical product, a negative level: refused per item |

**Lists** share one shape: `?since=<ISO 8601>` (records **updated** at or
after), `?per_page=` (1–100, default 50), `?page=`, ordered by `updated_at`
then `id` ascending so an integration can page forward and resume from the
last `updated_at` it saw. Standard paginator `meta` and `links`. Lead lists
also accept `?status=`; orders `?status=` and `?paid=1`; tickets
`?status=`.

## Refusals

- No `Authorization` header, a malformed key or an unknown one: **401**
  `{message: "The API key is missing or not recognised.", reason: "invalid_key"}`.
- Revoked: **401** `reason: "revoked"`; expired: **401** `reason: "expired"`.
  The holder already had the key, so naming why costs nothing.
- From an address outside the allowlist: **403** `reason: "ip_not_allowed"`.
- Without the route's scope: **403** `reason: "missing_scope"` and the
  message names the scope.
- Over the rate limit (**120 requests a minute per key**, its own limiter
  key `api-key:<id>`, not per route): **429** with `Retry-After`.
- During a restore or an update the existing `EnsureNotRestoring` 503 applies
  as to every API route.
- A refused request with a recognised key is still logged against that key.

## Logging

- `api_key_requests`: `api_key_id`, `method`, `path` (no query string —
  `since` and filters are not worth storing, and a query string may carry
  data), `status`, `ip`, `duration_ms`, `created_at`. Written in the
  middleware's `terminate()` so the response is never held up, guarded so a
  logging failure never fails the request. Pruned at 30 days by
  `technoware:prune-api-key-requests` (nightly, scheduler).
- On the key: `last_used_at`, `last_used_ip`, written at most once a minute
  per key (query builder, no `updated_at` move).
- Creating, editing, rolling, revoking and deleting a key are admin writes
  and reach the activity log by its existing rules; the key itself is never
  in any context: it is only ever in a *response*, and `ActivityLogger` reads
  request input. **No admin request field may be named `key`** — `key` is on
  the logger's context allowlist.

## Admin API (`role:admin`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/api-keys` | Paginated by name. `meta.scopes`, `meta.base_url` (`url('/api/v1/ext')`) |
| `POST` | `/admin/api-keys` | `name`, `scopes[]` (≥1), `expires_at?`, `allowed_ips?` (string, lines). **201** with `key` beside the resource, once |
| `GET` | `/admin/api-keys/{id}` | |
| `PATCH` | `/admin/api-keys/{id}` | name, scopes, expiry, allowlist. A revoked key cannot be edited (422) |
| `POST` | `/admin/api-keys/{id}/roll` | New key, same row; `key` once. Refused on a revoked key (422): revoking is final, and a new key is made instead |
| `POST` | `/admin/api-keys/{id}/revoke` | Idempotent |
| `DELETE` | `/admin/api-keys/{id}` | 204, its log with it |
| `GET` | `/admin/api-keys/{id}/requests` | Newest first, paginated, `?status=ok\|error`. `meta.counts` — requests per day for the last 30 days, every day present |

The resource: `id, name, prefix, scopes, scope_labels, expires_at,
is_expired, revoked_at, status (active|expired|revoked), allowed_ips (array),
last_used_at, last_used_ip, created_by, created_at, updated_at,
requests_30d`. Never the key or its hash.

## Console

- **System → API keys** (`/admin/api-keys`), a sidebar row beside Webhooks,
  `role: "admin"`, its icon from `icons-ui` or an existing glyph. Mirrors the
  Webhooks screens: list (name, prefix in mono, scopes as chips, status
  badge, last used), `new`, `[id]` edit with the secret-once panel after
  create or roll, Revoke/Roll/Delete with confirmations, and a "Recent
  requests" table with a 30-day `Sparkline`/`BarList` from the chart kit.
- The edit screen shows the base URL and a copyable `curl` example built
  from it and the key's first scope (the key itself only while it is on
  screen after create/roll; otherwise `ak_…` placeholder).
- `ScreenAccess` and `nav-items.tsx` gain the row together
  (`AdminNavRolesTest` compares them). Command palette entry by derivation.
- Mock API (`web/scripts/mock-api.mjs`) implements the admin endpoints.
- Both audits' route lists gain `/admin/api-keys`, `/admin/api-keys/new` and
  a `DISCOVER` entry for the edit screen.

## Constraints

- Laravel conventions in CLAUDE.md: morph map entry for `api_key` (it is a
  lead's source), relation return types, Larastan level 5 clean,
  `response()->json` wrapping rule, `throttle` semantics.
- `ApiKey` is **not** a Sanctum tokenable and never resolves as
  `$request->user()`; the middleware puts it on the request as an attribute
  (`$request->attributes->get('api_key')`).
- A lead filed by a key has `channel = 'api'` and `form_name = 'API: <key name>'`; there is no channel list to extend (the console filters on the raw value).

## Left to the builder

- Exact file split of the `/ext` controllers (one per resource is the
  default).
- The console icon.
- Whether the request log's daily counts are a SQL group-by or cached.

## Docs

`docs/api-keys.md` (module note), CLAUDE.md module line, API.md section,
`manual/39-api-keys.md`, VERSION.md 0.189.0 (C4 keeps its plan; numbering
follows whichever ships first).
