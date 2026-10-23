# C7 — LinkedIn and X posts, reviewed before they go out (0.190.0)

The roadmap's C7. Decided with the user on 2026-10-23; anything marked
**Claude's call** was not discussed and is a default the user can override.

## Intent

When the company publishes something worth announcing, it should reach the
company's LinkedIn page and X account without somebody writing each post from
scratch — and **nothing may go out unread**. The site prepares the wording; a
person who can edit content reads it, edits it if needed, and approves it, and
approval sends it at once. Where no account is connected (LinkedIn's app review
can take weeks, or be refused), approval still works: it copies the approved
text and opens the network for the person to post by hand.

The public site's share buttons (visitors sharing a page) already exist and are
not part of this.

## Goals

- A draft for LinkedIn and a draft for X are prepared automatically when a
  **blog post, case study, event or newsroom press release** is published.
- An editor can ask for a draft by hand for any of those four, published, at any
  time — an older article, or the same one again later.
- One review list in the console shows drafts waiting, sent, shared by hand and
  discarded. Approve, edit-then-approve, or discard.
- Approve sends immediately through the connected account, or falls back to
  copy-and-open when there is none or the network refuses.
- Every sent post keeps the link to the live post on the network.

## Non-goals

- Scheduling for later (the user chose "go out at once").
- Posting without a person's approval, ever — no auto-send setting.
- Other networks (Facebook, Instagram, WhatsApp channels), personal profiles,
  several pages per network, replies, comments, analytics from the networks.
- Drafts for shop products, vacancies, tenders, pages or any other kind (the
  user chose the four).
- Uploading pictures to the networks: see "Pictures".

## Anti-goals

- A post going out that nobody approved, or going out twice from one approval.
- A draft that names a page that is not published, or a link to a draft.
- A refused or failed send that looks sent.
- An editor waiting on a network call that hangs: sends are bounded.
- A token or client secret in any response, log or activity context.

## Decided with the user

- Review first; the site prepares the wording; a person approves it.
- The four content kinds above get an automatic draft on publish.
- Approve sends at once.
- **Anyone who can edit content approves** — `role:content_manager` (the
  activity log records who approved).
- Without a connected account, or if the network refuses, Approve **copies the
  text and opens LinkedIn or X** with the link, for posting by hand.
- An editor can draft by hand for something already published, including again.

## How it works (Claude's calls unless marked)

### Drafts

- `social_posts`: `id`, `network` (`linkedin` | `x`), `status`
  (see Settled §10),
  `subject_type` + `subject_id` (morph: `blog_post`, `case_study`, `event`,
  `entry`), `text`, `url` (the record's public URL at drafting time),
  `source` (`publish` | `manual`), `drafted_by` (null for automatic),
  `approved_by`, `approved_at`, `sent_at`, `remote_id`, `remote_url`,
  `error` (the network's words, for the console), `timestamps`.
- **Automatic on publish:** when a record of the four kinds moves to published
  — the first time it becomes publicly visible, not on every save of an
  already-published record — one draft per network is queued (`after commit`,
  never failing the save, the `Webhooks::emit` / IndexNow guard pattern). A press
  release is an `Entry` whose content type's `preset` is `newsroom_releases`;
  other entries get no automatic draft. A record whose `published_at` is in the
  future gets its drafts when it actually goes live (the scheduled-publish path
  already exists for posts and entries — hook where visibility changes, or have
  a small scheduled sweep pick up records that became visible since the last
  run; builder's choice, as long as each record is drafted once).
- **By hand:** `POST /admin/social-posts/draft {type, id}` on a published record
  makes a fresh pair (`source: manual`), whatever already exists.
- **Wording:** the AI writes it through a new `SocialSurface` on the existing
  `App\Support\Writing\Writer` (its switch, key, house style, words to avoid and
  `ai_writing_daily_cap`; one run per network). Input: title, summary/excerpt,
  the first ~300 words of the body as text, the record kind and URL. LinkedIn:
  up to ~1,300 characters, plain text, short paragraphs, up to three hashtags.
  X: must fit **280 characters with the link counted as 23** (X's t.co rule);
  the URL is added by the site, never written by the model. No `[CHECK:]`
  markers are allowed in a draft (the model is told to use only the article's
  own facts). With AI off, refused or over its cap, the draft is the title, the
  summary and the link, trimmed to fit — still a draft, still reviewed.
- Drafts are plain text. The editor's textarea shows a live count for X using
  the 23-character link rule; the API refuses an X text over the limit (422)
  and a LinkedIn text over 3,000 characters.

### Review

- Console: **Content → Social posts** (`/admin/social-posts`), a list filtered by
  status (default Waiting) and network: the record's title and kind, the network,
  the draft text, who drafted it and when. Each row opens a review panel: the
  editable text, a preview of the link card (the record's own og image and
  title, drawn from what the site already has), **Approve and send** (or **Copy
  and open** when not connected), **Discard**.
- Records' edit screens for the four kinds gain a **Draft a social post** button
  in the `PageHeader` row (never inside the record's `<Form>`), shown only when
  the record is published; it creates the pair and links to the review list.
- Editing a draft and approving are one action (`POST …/{id}/approve {text}`),
  so what is sent is exactly what was on screen.

### Sending

- `approve` claims the draft with a conditional update `draft → sending`
  (no double send from two presses or two tabs) and sends **within the
  request**, bounded at 15 seconds — the editor is waiting for "sent".
  - **LinkedIn:** the Posts API (`POST https://api.linkedin.com/rest/posts`)
    as the organisation (`author: urn:li:organization:<id>`), text as
    `commentary`, the URL as an article share so LinkedIn draws the link card.
    Needs the Community Management API product on the client's LinkedIn app and
    scope `w_organization_social` (plus what is needed to list the pages the
    signed-in admin manages, to choose the organisation).
  - **X:** `POST https://api.x.com/2/tweets` with the text and the URL appended,
    OAuth 2.0 user context with PKCE, scopes `tweet.write tweet.read users.read
    offline.access`.
  - Success → `sent`, `remote_id`, `remote_url`, `sent_at`, `approved_by/at`.
  - Refusal or timeout → `failed` with the network's words in `error`; the
    response tells the console, which offers **Copy and open** for that draft
    (and Retry). A token refusal also writes the connection's error row
    (`mail_error` pattern) so Settings shows "reconnect".
- **Not connected:** `approve` stores the approved text, sets
  `shared_manually` with `approved_by/at`, and answers with an `open_url`:
  - X: `https://x.com/intent/post?text=<text>&url=<url>` (pre-fills both).
  - LinkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=<url>`
    (LinkedIn does not pre-fill text), and the console copies the text to the
    clipboard first and says so.
  The console opens it in a new tab from the click (so no popup blocker).
- **Failed** drafts can be retried (`failed → sending`) or shared by hand.
- `remote_url` for X is `https://x.com/i/web/status/<id>`; for LinkedIn
  `https://www.linkedin.com/feed/update/<urn>`.

### Pictures

Claude's call: **no image upload**. Both networks draw a link card from the
page's own Open Graph tags (title, description, og image), which the site
already emits for every one of the four kinds. Uploading media would need a
second API flow per network for no visible gain on a link post. The review
panel previews that card so the editor sees what will appear.

### Connections

- Settings → **Social accounts** (`role:admin`), one card per network: client
  ID and secret (private settings group `social`, secrets encrypted, blank =
  unchanged), the callback address to register, **Connect**, the connected
  page/account name, **Disconnect**, the last error, and for LinkedIn a plain
  note that LinkedIn must approve the app for company-page posting first.
- Built on `App\Support\OAuth\OAuthConnection` with two new slots
  (`OAuthProvider::LinkedIn`, `OAuthProvider::X`), each its own prefix, cache
  namespace, error key and `CallbackPath` (`/admin/settings/social/linkedin/callback`,
  `/admin/settings/social/x/callback`). X needs PKCE (the verifier kept with the
  single-use `state`); add it to `OAuthConnection` only for providers that need
  it. LinkedIn: after consent, list the organisations the admin administers and
  let them choose one (stored `social_linkedin_organization_id` + name).
- Tokens refresh like the other slots; a refresh that fails marks the
  connection's error and drafts fall back to Copy and open.
- The public `/settings` map learns nothing.

## API

All `role:content_manager` unless noted. Exact shapes are the builder's, in the
house style (resources, `meta` carrying enums with labels, 422 sentences).

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/social-posts` | `?status=` (default `draft`), `?network=`, `?per_page=` ≤100. `meta.networks` with `{value, label, connected, limit}`, `meta.statuses` |
| `GET` | `/admin/social-posts/{id}` | with `subject {type, id, title, admin_path, public_url, image}` |
| `PATCH` | `/admin/social-posts/{id}` | `text`, only while `draft` or `failed` |
| `POST` | `/admin/social-posts/draft` | `{type, id}` — a published record of the four kinds, else 422. 201 with both drafts |
| `POST` | `/admin/social-posts/{id}/approve` | `{text}`. 200 with the post (`sent`) or with `open_url` (`shared_manually`), or 422 with the network's refusal and the post `failed`. Throttled |
| `POST` | `/admin/social-posts/{id}/discard` | from `draft` or `failed` |
| `GET` | `/admin/settings/social` | `role:admin`. Per network: configured, connected, account name, error, callback path |
| `POST` | `/admin/settings/social/{network}/authorize` · `/callback` · `/disconnect` | `role:admin`, the meetings-Google shape |
| `POST` | `/admin/settings/social/linkedin/organization` | `role:admin`, `{id}` from the listed organisations |

A record resource for the four kinds may carry `social_posts_count` for the
button; builder's call.

## Notifications

- A new automatic pair adds a bell notification for content managers? **No**
  (Claude's call): the list's count in the sidebar is enough, and a bell row per
  publish is noise. The sidebar row shows the waiting count via the existing
  `new-since` poll pattern if cheap; otherwise no count.

## Constraints

- Laravel conventions in CLAUDE.md (morph map entries exist for all four
  subjects; relation generics; Larastan clean; `Notifier`-style guards: a draft
  failing to be made never fails a publish).
- `X` text limit is 280 with any URL counted as 23; LinkedIn commentary max
  3,000.
- No network call during a test: `Http::fake()` and
  `Http::preventStrayRequests()` in every test that reaches a sender.
- Mock API implements the admin endpoints; audits gain the new routes.
- Copy follows the house voice; every refusal is one sentence.

## Left to the builder

- How "first became publicly visible" is detected for scheduled records.
- The exact prompt wording for the two networks.
- Whether the sidebar row shows a waiting count.
- Whether the review panel is a page or a side panel.

## Settled after the builder check (Claude's calls)

1. **LinkedIn tokens.** Store the access token's expiry. Use a refresh token when LinkedIn issues one (approved partner apps); when it does not, `OAuthConnection` must accept a consent with no refresh token for this provider, and Settings warns from 7 days before expiry ("Reconnect LinkedIn by <date>"); once expired, drafts fall back to Copy and open.
2. **X OAuth** differs three ways: PKCE, a confidential client authenticating the token call with HTTP Basic, and single-use rotating refresh tokens. Put these behind provider capabilities inside `OAuthConnection` (no second class); a refresh is done under a cache lock, the new refresh token saved before the access token is used. A lost rotation disconnects the account and Settings says "reconnect" — an accepted failure mode.
3. **X posts by hand in this release** (the user said go without choosing; Claude's call, the cautious option). Approve on an X draft opens `https://x.com/intent/post?text=…&url=…` pre-filled, marking it `shared_manually`. There is no X connection card, no X OAuth slot and no X sender in 0.190.0 — §2 above describes how they would be built and is kept for that later release. The X draft, its 280/23 counting and the review are all built.
4. **Automatic drafts have no person.** The queued job calls the `Writer` through a system path: `SocialSurface` authorises a null user only for this job, the run counts against `ai_writing_daily_cap`, two calls (one per network).
5. **The draft exists at once** with the plain fallback text (title, summary, link) and `ai_pending = true`; when the AI answers it replaces the text only if the text is still the untouched fallback, then clears `ai_pending`. The list shows "Writing…" while pending; an editor may still edit or approve it (their text wins).
6. **When a record "is published".** Blog posts and entries are visible when `status = published` and `published_at <= now`; case studies and events when `status = published` (they have no `published_at`). A model `saved` hook drafts when the record is visible after the save and was not before; a ten-minute scheduled sweep (`technoware:draft-social-posts`) catches blog posts and entries whose future `published_at` has since passed. **Once per record:** no automatic pair is made if any `source = publish` row already exists for that record — unpublishing and republishing makes none. An event published after its date still gets drafts.
7. **Only `newsroom_releases` entries** get automatic drafts; `newsroom_coverage` and every other content type get none (and the manual button is not shown on them). The URL is **re-resolved at approval** from the record's current public path; the stored URL is what the draft was written about, and a 301 covers the gap.
8. **The LinkedIn organisation.** The consent asks for the scopes needed to list the organisations the admin administers; if the listing is refused, Settings lets the admin type the organisation ID instead.
9. **A content manager with no connection** sees on the review panel: "LinkedIn isn't connected, so Approve copies the text and opens LinkedIn for you to post. An administrator can connect it in Settings → Social accounts." — no link they cannot use.
10. **A timeout is not a failure.** A send that times out or loses its answer becomes `unconfirmed` ("We couldn't confirm LinkedIn received this. Check the page before trying again."); Retry from `unconfirmed` asks for confirmation first. A clear refusal is `failed`. Statuses: `draft`, `sending`, `sent`, `shared_manually`, `failed`, `unconfirmed`, `discarded`.

## Docs

`docs/social-posts.md`, CLAUDE.md module line, API.md section,
`manual/40-social-posts.md` (including how to create the LinkedIn and X apps and
what LinkedIn's review asks for), VERSION.md 0.190.0.
