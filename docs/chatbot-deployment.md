# Deploying the website assistant

The delta only. `README.md` covers the Plesk deployment this sits inside — two
domains, `api/public` as the API's document root, the Node application for the
frontend — and none of that changes. What follows is what the assistant adds,
what it needs, and what to do when it goes wrong.

Everything here was verified against this codebase rather than written from
memory; where something could not be verified in the session that wrote this,
it says so.

---

## It adds no new platform requirements

| | |
|---|---|
| PHP | `^8.3`, unchanged — `composer.json` gains nothing |
| PHP extensions | **none new**. There is no `ext-*` requirement anywhere in `composer.json`; the provider is called over `symfony/http-client`, which is already installed for the mail bridges |
| Composer packages | **none**. No SDK, no vector store, no queue driver |
| Node packages | **none**. The panel is built from this project's own primitives |
| Database | three migrations, all additive |

That is deliberate and is Rule 6: MySQL and `LIKE` against titles and
summaries, which is right for a corpus of a few hundred records. See
`chatbot-architecture.md` for where the ceiling actually is.

---

## Migrations

```
2026_09_02_000600_create_chat_tables          chat_conversations, chat_messages, chat_events
2026_09_02_000700_add_actions_to_chat_messages
2026_09_02_000800_add_chat_feedback           rating, rating_note; resolved_at on chat_events
```

All three are additive — no column is dropped and no existing table is
rewritten — so `php artisan migrate --force` on a live database is safe. They
run on every `RefreshDatabase` test, which is 712 tests' worth of evidence that
they apply cleanly to an empty schema.

---

## The seeder is not optional, and skipping it fails safe

```bash
php artisan db:seed --class=SettingsSeeder
```

Nine `chatbot` settings, plus `chat_retention_days` in the private `security`
group and `openai_api_key` in the private `integrations` group. The seeder is
idempotent — an existing row keeps its value and only its group, type and
secrecy are refreshed — so it is safe to re-run and is the only thing that
creates these rows.

**`PATCH /admin/settings` writes only keys that already exist**, so without the
seeder the console cannot save the API key and the module is simply absent:
`Setting::get()` returns the default `false` for a missing row, `chatbot_enabled`
is off, and the site renders exactly as it does today. That is the right failure
and it is silent, so it is worth knowing which way it fails.

---

## The API key

**Settings first, `.env` second** — `ChatSettings::apiKey()` reads
`openai_api_key` and falls back to `config('services.openai.key')`, which is
`AI_API_KEY` in the environment. The settings row is the intended home:

- group `integrations`, which is **not** in the public `/settings` whitelist
- `is_secret`, so it is encrypted at rest and comes back as
  `value: null, is_set: true` — never to a browser
- a blank submit means *unchanged*, because the form can never show it;
  clearing one is `POST /admin/settings/clear-secret`

The same trade the SMTP password already makes: rotating `APP_KEY` makes the
stored key unreadable.

`AI_API_KEY` in `api/.env` is the alternative for an operator who would rather
keep credentials out of the database. Setting both is harmless; the settings row
wins.

**Nothing about the provider reaches the browser.** Rule 3 — the panel talks to
Next, Next talks to Laravel, Laravel talks to the provider. `ChatTest` asserts
no response can carry the key.

---

## Cache and queue

```
CACHE_STORE=database        # already the shipped default
QUEUE_CONNECTION=database   # already the shipped default
```

**`CACHE_STORE` must be a persistent store, and this is the one item here that
silently breaks.** Two things live in the cache:

- the **daily reply counter**, which is what bounds the bill. On an `array`
  store it resets every request, so `chatbot_daily_reply_cap` never triggers
  and the ceiling does not exist.
- the **retrieval cache**, five minutes, which saves 10–13 queries per question.
  On `array` it is a no-op — slower, not wrong.

The queue matters because `ChatLeadCaptured` is queued like every other
notification here. Without something draining it the lead is still written —
`LeadIntake` runs before the notification and cannot be failed by it — and the
sales desk simply never hears. That is the failure `/admin/settings` warns about
when the oldest waiting job is over five minutes old.

The cron entry is the one `README.md` already requires and is not optional:

```
* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1
```

It drains the queue **and** runs `technoware:prune-chats` at 03:20.

---

## Retention and privacy

A transcript holds whatever a visitor typed into a box, given by somebody with
no account. `chat_retention_days` defaults to **90**, with a floor of 7 enforced
in code so a typo cannot keep them for ever, and the nightly prune deletes by
age. There is no delete endpoint and no edit path: a record its own subject can
tidy is evidence of nothing, which is the rule the activity log follows.

`session_token` and `ip` are `$hidden` on the model. The console shows a
transcript at `role:admin` and nowhere else.

**Back up `chat_conversations`, `chat_messages` and `chat_events` with
everything else.** They are the evidence behind every figure on the overview and
behind `/admin/chat/unanswered`, which is the list of pages somebody should
write. Nothing else reconstructs them.

---

## Rate limits, as deployed

Read off `routes/api.php` rather than from memory:

| route | limit |
|---|---|
| `POST /chat/conversations` | 6/min |
| `GET /chat/conversations/{token}` | 30/min |
| `POST /chat/conversations/{token}/messages` | 12/min |
| `POST /chat/conversations/{token}/lead` | 5/min |
| `POST .../messages/{id}/rating` | 20/min |

Those bound one visitor. **Only `chatbot_daily_reply_cap` bounds a bad
afternoon**, and the console's overview reports today against it — replies used,
replies left, and the tokens spent, which is what the provider actually bills
for.

---

## Logging

Chat provider failures log at `warning`, which clears the shipped
`LOG_LEVEL=warning`. That is deliberate: `logger()->info(...)` is discarded on
both `.env` files, and a log line an operator needs must clear the level that
ships.

A provider failure never reaches the visitor in the provider's words — those
carry model names, quota messages and organisation ids. What comes back is the
pages that were found.

---

## Switching it off

`chatbot_enabled`, Rule 9. **Do it from the console, not from the database.**

Saving in the console calls `updateTag("settings")`, which invalidates the tag
the site's settings read is cached under and takes effect at once. A direct
`UPDATE` on the row does not: `lib/settings.ts` revalidates at 600s, and the
marketing pages are statically prerendered, so the launcher goes on rendering
until the page revalidates. This was walked into while writing this document —
the setting was flipped in the database, three server restarts later the panel
was still there, and it was behaving exactly as `CLAUDE.md` says it will.

Switched off, `Analytics`-style: the layout renders nothing at all, and every
`/chat/*` route answers as though the module were absent.

---

## What it costs a page

Measured against a production build (`npm run start`), homepage, cold:

```
total page JS      583.2 KB
of which the assistant  61.8 KB   (one chunk)
```

The panel is a client component behind `settingEnabled(settings,
"chatbot_enabled", false)` in `(marketing)/layout.tsx` only — never the console,
never the portal. **Whether that chunk is absent when the setting is off was not
verified**: measuring it needs the switch thrown from the console and the
prerendered pages regenerated, which is the paragraph above. The App Router
sends a client chunk only for components in the RSC payload, so it should be;
that is reasoning, not a measurement, and it is written here as such.

---

## Deployment procedure

Assumes the `README.md` steps for both domains. In order:

```bash
# --- API ---
cd /path/to/api
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan db:seed --class=SettingsSeeder      # creates the settings rows
php artisan config:cache && php artisan route:cache && php artisan event:cache

# --- frontend ---
cd /path/to/web
npm ci
npm run build          # API_BASE_URL must be reachable in the BUILD environment
```

Then, in the console and in this order:

1. `/admin/settings` → paste the API key, save.
2. Set `chatbot_model` if `gpt-4o-mini` is not what you want.
3. Check `chatbot_daily_reply_cap`. The default of 500 is a real ceiling, not a
   placeholder — decide it deliberately.
4. Write `chatbot_welcome`, `chatbot_quick_actions` and `chatbot_fallback`. The
   fallback is what a visitor reads whenever the site cannot answer, which on a
   new install is often.
5. **Then** switch `chatbot_enabled` on.

That order matters: switched on before the key is stored, the assistant answers
every question with the retrieved links and no prose. It is a deliberate
degradation and not a good first impression.

Verify:

```bash
php artisan test --filter='ChatTest|ChatJourneyTest'
```

and open the panel on the live site and ask it something the website answers.

---

## Rollback

The module is additive, so rolling it back is a switch rather than a migration.

**Immediate**, and the answer in an incident: switch `chatbot_enabled` off in
the console. Every route answers as though it were absent and the launcher stops
rendering. Nothing else in the site depends on it.

**Code**: deploy the previous release. The three migrations may be left in
place — nothing outside the module reads those tables, and rolling them back
destroys transcripts that `/admin/chat/unanswered` is built from. If they must
go:

```bash
php artisan migrate:rollback --step=3
```

**Do not roll back the settings rows.** They are shared with other groups
(`security`, `integrations`) and the seeder is idempotent; leaving them costs
nothing and removing them takes `chat_retention_days` and the API key with them.

The one thing that cannot be rolled back is a message already sent to the
provider. That is the argument for the daily cap being a real number rather than
a large one.
