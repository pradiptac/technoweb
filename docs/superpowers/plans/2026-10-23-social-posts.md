# C7 LinkedIn and X posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a blog post, case study, event or press release is published (or an editor asks), the site drafts a LinkedIn post and an X post; a content manager reviews and approves each, and approval posts to the connected LinkedIn page or, for X and any unconnected case, copies/opens the network for posting by hand.

**Architecture:** A `social_posts` table of drafts per network, made by `SocialDrafts` (fallback text at once, AI wording through the existing `Writer` in a queued job), sent by `SocialSender` (LinkedIn Posts API through a new `OAuthConnection` slot; X always by intent URL in this release). A Content → Social posts review screen, a "Draft a social post" button on the four records' edit screens, and Settings → Social accounts for LinkedIn.

**Tech Stack:** Laravel 13 / PHP 8.3 / PHPUnit 12 (api), Next.js 16 / TypeScript / Tailwind v4 (web).

**Spec:** `docs/superpowers/specs/2026-10-23-social-posts-design.md` (read "Settled after the builder check" — it overrides the sections above it where they differ).

## Global Constraints

- Version **0.190.0** (`web/src/lib/version.ts`, `VERSION.md`).
- Subjects: `blog_post`, `case_study`, `event`, and `entry` **only when its content type's `preset` is `newsroom_releases`**. Nothing else is drafted or offered the button.
- Visible = blog post / entry: `status = published` and `published_at <= now`; case study / event: `status = published`.
- One automatic pair per record ever (no `source = publish` pair yet); manual drafts any number of times, published records only.
- Statuses: `draft`, `sending`, `sent`, `shared_manually`, `failed`, `unconfirmed`, `discarded`. Networks: `linkedin`, `x`.
- X: 280 characters with the URL counted as **23**; LinkedIn commentary ≤ **3,000** characters. The site appends the URL to X text; the model never writes a URL.
- **X is never sent through an API in this release**: approving an X draft returns `https://x.com/intent/post?text=<urlencoded text>&url=<urlencoded url>` and marks it `shared_manually`.
- LinkedIn not connected / token expired / refused → `open_url` `https://www.linkedin.com/sharing/share-offsite/?url=<urlencoded url>`, console copies the text to the clipboard first.
- A send is bounded at **15 s**; a connection error or timeout → `unconfirmed`; an HTTP refusal → `failed` with the network's words; a 401 also writes `social_linkedin_error`.
- Approve from `unconfirmed` requires `confirm: true`.
- Review/approve routes are `role:content_manager`; connection routes are `role:admin`.
- Artisan command prefix is `technoware:` — the sweep is `technoware:draft-social-posts`, every ten minutes.
- No network call in any test: `Http::preventStrayRequests()` + `Http::fake()` wherever a sender or OAuth call is reached.
- Laravel/CLAUDE.md rules as in C6 (morph map, relation generics, `@mixin`, 201 via `->response()`, Larastan "No errors"); a draft failing to be made never fails a publish (guarded, logged at `warning`).
- Frontend rules as in C6 (`<Form>`, `FormActions`, `PageHeader`, `.admin-table` + `data-label`, icons-ui in client components, `lib/dates.ts`); the Draft button sits in the `PageHeader` row, never inside the record's `<Form>`.
- If an API shape changes, `web/mock-api.mjs` changes too.

## Review Focus

- A blog post saved as published with a **future** `published_at` → no drafts on save; drafts appear once the sweep runs after that time, and only once. (Task 2 test.)
- An editor edits a draft while the AI job is still pending → the AI answer must not overwrite the editor's text. (Task 2 test.)
- Two approve presses on one draft (double click / two tabs) → exactly one LinkedIn API call; the second gets 422 "This post has already been sent." (Task 3 test.)
- X text that fits only because the URL counts as 23 (e.g. 257 chars + a 90-char URL) → accepted; 258 + URL → 422. (Task 1 test.)
- An entry of a non-press-release type (e.g. `newsroom_coverage`) published → no drafts; `POST /admin/social-posts/draft` for it → 422. (Task 2 / Task 4 tests.)

---

### Task 1: Data, enums and the subject rules

**Files:**
- Create: `api/database/migrations/2026_10_29_100000_create_social_posts_table.php`, `api/app/Models/SocialPost.php`, `api/app/Enums/SocialNetwork.php`, `api/app/Enums/SocialPostStatus.php`, `api/app/Support/Social/SocialSubjects.php`, `api/app/Support/Social/SocialText.php`
- Test: `api/tests/Unit/SocialSubjectsTest.php`, `api/tests/Unit/SocialTextTest.php`

**Interfaces:**
- Produces:
  - `social_posts`: `id, network (string 16), status (string 20, index), subject_type (string 40), subject_id (unsigned bigint), text (text), url (string 2048), source (string 10: publish|manual), ai_pending (bool default false), drafted_by (nullable FK users nullOnDelete), approved_by (nullable FK users nullOnDelete), approved_at, sent_at (nullable ts), remote_id (string 255 nullable), remote_url (string 2048 nullable), error (text nullable), timestamps`; index `(subject_type, subject_id)`.
  - `enum SocialNetwork: string { LinkedIn='linkedin', X='x' }` with `label()` (`LinkedIn`, `X`), `limit(): int` (3000 / 280), `static options(): array`.
  - `enum SocialPostStatus: string` (the seven) with `label()` (`Waiting`, `Sending`, `Sent`, `Shared by hand`, `Failed`, `Couldn't confirm`, `Discarded`), `static options()`.
  - `SocialPost` casts `network`/`status` to the enums, `ai_pending` bool, the two timestamps; `subject(): MorphTo`, `drafter(): BelongsTo<User,$this>`, `approver(): BelongsTo<User,$this>`.
  - `SocialSubjects::ALIASES = ['blog_post','case_study','event','entry']`; `supports(Model $m): bool` (entry only with preset `newsroom_releases`); `isVisible(Model $m): bool` (the Global Constraints rule); `find(string $alias, int $id): ?Model`; `title(Model $m): string`; `summary(Model $m): string` (excerpt/summary column, else first 200 chars of body text via `HtmlSanitiser::toText`); `bodyText(Model $m, int $words = 300): string`; `publicUrl(Model $m): string` (absolute, `config('app.frontend_url')` + the record's public path); `adminPath(Model $m): string` (`/admin/blog/{id}`, `/admin/case-studies/{id}`, `/admin/events/{id}`, `/admin/content/{type-slug}/{id}`); `kindLabel(Model $m): string`.
  - `SocialText::xLength(string $text): int` (each `https?://\S+` counts 23); `SocialText::xFits(string $text, string $url): bool` (`xLength($text) + 1 + 23 <= 280`); `SocialText::fallback(SocialNetwork $n, string $title, string $summary, string $url): string` (LinkedIn: title, blank line, summary, blank line, url; X: `title — summary` trimmed at a word boundary with `…` so `xFits(…, $url)`, URL not included — it is appended at send/intent time).

- [ ] **Step 1: Write failing tests** — `SocialTextTest`: `test_a_url_counts_as_23`, `test_x_fits_counts_the_appended_link` (257 plain chars + 90-char URL → true; 258 → false — Review Focus), `test_x_fallback_is_trimmed_to_fit_at_a_word`, `test_linkedin_fallback_carries_title_summary_and_link`. `SocialSubjectsTest` (RefreshDatabase): `test_only_press_release_entries_are_supported` (newsroom_releases entry true, newsroom_coverage entry false), `test_visibility_rules` (future-dated published blog post false; draft case study false; published event true), `test_public_url_and_admin_path`.
- [ ] **Step 2: Run** `php artisan test --filter="SocialTextTest|SocialSubjectsTest"` — FAIL.
- [ ] **Step 3: Implement** migration, enums, model, the two support classes. Read each subject model for its summary/body/path columns (`BlogPost`, `CaseStudy`, `Event`, `Entry` + `ContentType`).
- [ ] **Step 4: Run** the same filter — PASS; `composer analyse` — "No errors".
- [ ] **Step 5: Commit** `"C7: social_posts table, enums and subject rules"`.

### Task 2: Making drafts — on publish, by sweep, by hand, and the AI wording

**Files:**
- Create: `api/app/Support/Social/SocialDrafts.php`, `api/app/Support/Writing/Surfaces/SocialSurface.php`, `api/app/Jobs/WriteSocialPost.php`, `api/app/Console/Commands/DraftSocialPosts.php`
- Modify: `api/app/Support/Writing/Writer.php` (add `runSystem`), `api/app/Providers/AppServiceProvider.php` (saved listeners for the four models), `api/routes/console.php` (sweep every ten minutes, beside the health/link commands)
- Test: `api/tests/Feature/SocialDraftsTest.php`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `SocialDrafts::onSaved(Model $m): void` — guarded (try/catch, warning log); if `supports` and `isVisible` now and no `source=publish` row exists for the record, `forRecord($m, 'publish', null)`. (Being visible now and having no publish pair is the whole test — no "was it visible before" bookkeeping needed, and it is idempotent.)
  - `SocialDrafts::forRecord(Model $m, string $source, ?User $by): array{0: SocialPost, 1: SocialPost}` — creates one row per network with `SocialText::fallback(...)`, `url = publicUrl`, `status = draft`, `ai_pending = true` when `Writer::refusal() === null` else false; dispatches `WriteSocialPost` per row **after commit** when `ai_pending`.
  - `SocialDrafts::sweep(): int` — for blog posts and press-release entries visible now with no publish pair, published in the last 30 days, call `forRecord(..., 'publish', null)`; returns how many records were drafted. Command `technoware:draft-social-posts` calls it.
  - `Writer::runSystem(Surface $surface, WritingInput $input): WritingResult` — `run()` without `authorise()`; same refusals, cap counting and fence.
  - `SocialSurface` (`key()` = `social`): `ref` = `{type, id, network}`; `prepare` builds the prompt from `SocialSubjects::title/summary/bodyText/kindLabel` inside the fence, the house style and words to avoid from `WritingSettings`, the network rules (LinkedIn ≤ 1,300 chars, short paragraphs, up to three hashtags, no URL; X ≤ 230 chars, no URL, at most two hashtags), "use only facts in the article; never write [CHECK] or placeholders"; answer `{"text": "..."}`; `rebuild` returns plain text (strip any URL the model wrote; X trimmed with `SocialText` to fit). `authorise()` returns false (it is only for `runSystem`).
  - `WriteSocialPost(int $postId)` job: loads the post; if `ai_pending` and status `draft`, runs `Writer::runSystem`; on success **replaces `text` only if it still equals the original fallback** (compare to `SocialText::fallback(...)` recomputed, or store the fallback hash — implementer's choice), then `ai_pending = false` in all cases (refusal included).
  - Listeners: in `AppServiceProvider::boot`, `BlogPost::saved`, `CaseStudy::saved`, `Event::saved`, `Entry::saved` → `SocialDrafts::onSaved($model)`.

- [ ] **Step 1: Write failing tests** (`Queue::fake()` where the job is asserted, real job run where the replacement is asserted with `Http::fake` of the OpenRouter endpoint as other Writer tests do — read `tests/Feature/AiWriting*Test.php` for the fake):
  - `test_publishing_a_post_makes_one_pair_with_fallback_text` (2 rows, `linkedin`/`x`, `source` publish, fallback text, `url` = public URL)
  - `test_saving_again_or_republishing_makes_no_second_pair`
  - `test_a_future_dated_post_is_drafted_by_the_sweep_once` (save with `published_at` tomorrow → 0 rows; `travel` 2 days; run command → 2 rows; run again → still 2) — Review Focus
  - `test_coverage_entries_and_drafts_are_never_drafted` — Review Focus
  - `test_the_ai_answer_replaces_untouched_fallback_text` and `test_an_editors_text_is_never_overwritten_by_the_ai` (edit text before running the job → job keeps editor text, clears `ai_pending`) — Review Focus
  - `test_with_ai_off_drafts_are_not_pending_and_no_job_is_queued`
  - `test_a_failure_making_drafts_never_fails_the_save` (make `SocialDrafts` throw via a bound fake or a broken subject; the post still saves)
- [ ] **Step 2: Run** `php artisan test --filter=SocialDraftsTest` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `--filter="SocialDraftsTest|AiWriting"` — PASS; `composer analyse`.
- [ ] **Step 5: Commit** `"C7: drafts on publish, by sweep and by hand, worded by the Writer"`.

### Task 3: Sending — LinkedIn connection, poster and the approve rules

**Files:**
- Modify: `api/app/Support/OAuth/OAuthProvider.php` (case `LinkedIn = 'linkedin'`: auth `https://www.linkedin.com/oauth/v2/authorization`, token `https://www.linkedin.com/oauth/v2/accessToken`, revoke `https://www.linkedin.com/oauth/v2/revoke`), `api/app/Support/OAuth/OAuthConnection.php` (factory `linkedIn(): self` — scope `w_organization_social r_organization_admin`, prefix `social_linkedin_oauth_`, slot `social-linkedin`, errorKey `social_linkedin_error`, noun `LinkedIn`; accept a token response with **no** refresh token for providers flagged as not issuing one, storing the access token and its expiry; expose `expiresAt(): ?CarbonImmutable`)
- Create: `api/app/Support/Social/LinkedInPoster.php`, `api/app/Support/Social/SocialSender.php`, `api/app/Support/Social/SendOutcome.php`
- Modify: `api/database/seeders/SettingsSeeder.php` (private group `social`: `social_linkedin_oauth_client_id`, `social_linkedin_oauth_client_secret` (secret), `social_linkedin_organization_id`, `social_linkedin_organization_name`, `social_linkedin_error`)
- Test: `api/tests/Feature/SocialSenderTest.php`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `LinkedInPoster::ready(): bool` (connected, org id set, token not expired); `LinkedInPoster::post(string $text, string $url, string $title): array{id: string, url: string}` — `POST https://api.linkedin.com/rest/posts`, headers `Authorization: Bearer`, `LinkedIn-Version: <const LINKEDIN_VERSION>` (verify a currently supported `YYYYMM` against LinkedIn's Posts API docs; note the source in a comment), `X-Restli-Protocol-Version: 2.0.0`; body `{author: "urn:li:organization:<id>", commentary, visibility: "PUBLIC", distribution: {feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: []}, content: {article: {source: url, title}}, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false}`; timeout 15 s; id from the `x-restli-id` header; url `https://www.linkedin.com/feed/update/<id>`. Throws `SocialRefused(string $message, int $status)` on a non-2xx (message from LinkedIn's JSON `message`), lets `ConnectionException` through. `organizations(): array<array{id, name}>` (organizationAcls for the signed-in admin as ADMINISTRATOR, then names) — may throw `SocialRefused`.
  - `SendOutcome { public SocialPost $post; public ?string $openUrl; public ?string $refusal; }`.
  - `SocialSender::approve(SocialPost $p, string $text, User $by, bool $confirm = false): SendOutcome`:
    1. Validate text length for the network (X via `SocialText::xFits(text, url)`; LinkedIn ≤ 3000) → `refusal` "That is too long for X." / "LinkedIn allows up to 3,000 characters."
    2. Only from `draft`, `failed`, or `unconfirmed` with `$confirm` — else refusal ("This post has already been sent." for `sent`/`shared_manually`/`sending`; "Discarded posts cannot be sent." ; "Check LinkedIn first — confirm to send it again." for unconfirmed without confirm).
    3. Claim with a conditional update `whereKey()->whereIn('status', allowed)->update(['status' => 'sending', 'text' => $text])`; 0 rows → "This post has already been sent." (Review Focus).
    4. Re-resolve the URL from the subject (`SocialSubjects::publicUrl`); if the subject is gone or no longer visible → back to `draft`, refusal "That page is no longer published."
    5. X, or LinkedIn not `ready()`: status `shared_manually`, `approved_by/at`, `openUrl` per Global Constraints.
    6. LinkedIn ready: post; success → `sent`, `remote_id`, `remote_url`, `sent_at`, `approved_by/at`, clear `error`; `SocialRefused` → `failed`, `error`, refusal = the message, and on 401 call the connection's `fail()` so Settings shows reconnect; `ConnectionException` → `unconfirmed`, error "We couldn't confirm LinkedIn received this. Check the page before trying again."
  - `SocialSender::discard(SocialPost $p): ?string` (refusal unless `draft`/`failed`/`unconfirmed`).

- [ ] **Step 1: Write failing tests** (`Http::preventStrayRequests()`; fake `api.linkedin.com/*`):
  - `test_x_approval_returns_an_intent_url_and_marks_shared_by_hand` (assert url-encoded text and url in `openUrl`; no HTTP call)
  - `test_linkedin_without_a_connection_falls_back_to_share_offsite`
  - `test_linkedin_posts_as_the_organisation_and_records_the_live_url` (assert request body `author`, `commentary`, `content.article.source`, headers; post `sent`, `remote_url`)
  - `test_a_refusal_is_failed_with_linkedins_words_and_a_401_marks_the_connection`
  - `test_a_timeout_is_unconfirmed_and_retry_needs_confirmation` (`Http::fake` throwing `ConnectionException`)
  - `test_a_second_approve_sends_nothing` (call approve twice → `Http::assertSentCount(1)`, second refusal) — Review Focus
  - `test_x_text_over_the_limit_is_refused`
  - `test_an_unpublished_subject_is_refused_and_the_draft_kept`
  - `test_a_connection_without_a_refresh_token_is_accepted_and_reports_its_expiry` (OAuthConnection::linkedIn exchange with a fake token response lacking `refresh_token`)
- [ ] **Step 2: Run** `php artisan test --filter=SocialSenderTest` — FAIL.
- [ ] **Step 3: Implement**; make sure the existing OAuth slots' behaviour is unchanged (run `--filter="OutgoingMailTest|InboundMailTest|MeetingsGoogle|ZohoBooksTest"`).
- [ ] **Step 4: Run** both filters — PASS; `composer analyse`.
- [ ] **Step 5: Commit** `"C7: LinkedIn connection, poster and approve rules; X by intent"`.

### Task 4: The admin API

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/SocialPostController.php`, `api/app/Http/Controllers/Api/V1/Admin/SocialAccountController.php`, `api/app/Http/Resources/Admin/SocialPostResource.php`, `api/routes/api/admin-social.php`
- Modify: `api/routes/api.php` (require `admin-social.php` in the admin group), `api/app/Support/Notifications/ScreenAccess.php` (rows `['/admin/social-posts', 'content_manager', false]` and `['/admin/settings/social', 'admin', false]` placed where the web NAV rows will sit — Content section and Settings), the activity logger needs nothing (approve is a POST under admin, recorded by rule)
- Test: `api/tests/Feature/SocialPostApiTest.php`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (routes named `admin.social-posts.*` / `admin.settings.social.*`):
  - `role:content_manager`: `GET social-posts` (`?status=` default `draft`, `?network=`, `?per_page=` 1–100 default 25; newest first; `meta.networks` = `[{value,label,limit,connected}]` where `connected` is true only for LinkedIn when `LinkedInPoster::ready()`, false for X; `meta.statuses`; `meta.waiting` = count of `draft`), `GET social-posts/{id}`, `PATCH social-posts/{id}` (`text` required string; only `draft`/`failed`/`unconfirmed`, else 422 on `text`), `POST social-posts/draft` (`{type, id}` — `type` in `SocialSubjects::ALIASES`, record exists, `supports`, `isVisible`, else 422 "Only a published blog post, case study, event or press release can be shared."; 201 with `{data: [linkedin, x]}`), `POST social-posts/{id}/approve` (`{text, confirm?}`, throttle `20,1`; 200 `{data, meta: {open_url}}` on success or fallback; 422 `{message, errors: {text: [refusal]}}` with the post's state in `data` on refusal), `POST social-posts/{id}/discard`.
  - `SocialPostResource`: `id, network, network_label, status, status_label, text, url, source, ai_pending, x_length (for X: SocialText::xLength(text) + 24), limit, drafted_by (name|null), approved_by (name|null), approved_at, sent_at, remote_url, error, created_at, subject: {type, id, title, kind, admin_path, public_url, image (og/cover URL or null)}`. Never tokens.
  - `role:admin`: `GET settings/social` (`{linkedin: {configured, connected, account, organization: {id,name}|null, expires_at, error, callback_path: "/admin/settings/social/linkedin/callback"}}`), `POST settings/social/linkedin/authorize` (`redirect_uri` checked by `CallbackPath::assert`), `POST settings/social/linkedin/callback` (`code`, `state`), `POST settings/social/linkedin/disconnect`, `GET settings/social/linkedin/organizations` (list, or 422 with LinkedIn's words), `POST settings/social/linkedin/organization` (`{id, name?}` — `id` digits; chosen from the list or typed).
  - The four records' admin detail resources carry nothing new (the button calls `draft`).

- [ ] **Step 1: Write failing tests**: list filters and `meta`; `draft` refuses a draft post and a coverage entry (Review Focus) and returns two rows for a published case study; `approve` happy path (X → `meta.open_url`); approve refusal shape; content manager can approve; a support engineer gets 403; settings endpoints admin-only (content manager 403); `callback` stores organization-less connection and `organization` saves the id; no token or secret in any response JSON.
- [ ] **Step 2: Run** `php artisan test --filter=SocialPostApiTest` — FAIL.
- [ ] **Step 3: Implement**, reusing the meetings-Google controller's authorize/callback/disconnect shape.
- [ ] **Step 4: Run** `--filter="Social|AdminNavRolesTest"` — Social PASS (AdminNavRolesTest may fail until Task 5 adds the web rows — note it); `composer analyse`.
- [ ] **Step 5: Commit** `"C7: admin API for social posts and the LinkedIn connection"`.

### Task 5: The console

**Files:**
- Create: `web/src/types/social-posts.ts`, `web/src/lib/admin/social-posts.ts` (+ re-export in `lib/admin/index.ts`), `web/src/app/admin/(app)/social-posts/{page.tsx,loading.tsx,actions.ts,review-panel.tsx}`, `web/src/components/admin/draft-social-button.tsx`, `web/src/app/admin/(app)/settings/social/{page.tsx,actions.ts,callback/page.tsx}` (follow the existing settings sub-screens' location convention — check where the meetings Google / Zoho Books connection screens live and mirror it; adjust the paths and the `ScreenAccess` row from Task 4 to match)
- Modify: `web/src/app/admin/(app)/nav-items.tsx` (Content section row "Social posts", `role: "content_manager"`; Settings row for Social accounts per the settings pattern), the four edit pages (`blog/[id]`, `case-studies/[id]`, `events/[id]`, `content/[type]/[id]` — the last only for press releases) to put `DraftSocialButton` in the `PageHeader` row when the record is published, `web/mock-api.mjs`, `web/scripts/audit.mjs` + `mobile-audit.mjs` (`/admin/social-posts`, the settings route, a DISCOVER for nothing — the list is the only screen)
- Test: `php artisan test --filter=AdminNavRolesTest`, `npx tsc --noEmit`, eslint on touched files

**Interfaces:**
- Consumes: Task 4's endpoints.
- Produces:
  - List: `PageHeader` "Social posts" (intro: drafts are made when something is published; nothing is posted until approved; X opens for posting by hand), status tabs/filter (Waiting default), network filter, `.admin-table` rows (record title + kind, network, text preview, "Writing…" badge while `ai_pending`, drafted/approved info, a "View post" plain `<a target="_blank" rel="noopener">` to `remote_url` when sent). Each row opens `review-panel` (`Modal size="side"`): editable `Textarea` with a live count (X uses `x_length` rules computed client-side with the same 23-character rule — put the rule in a tiny pure helper `web/src/lib/social-text.ts` with a `.check.mjs` like the other pure helpers), the link-card preview (subject image + title + host), the not-connected sentence from spec Settled §9 for LinkedIn when `connected` is false and always an X note ("X opens with this text filled in; post it there."), **Approve and send** / **Copy and open** (label by network+connected), **Discard**, and for `unconfirmed` a confirm step. On `open_url`: copy the text with `navigator.clipboard.writeText` (LinkedIn), then `window.open(open_url, "_blank", "noopener")` from the click handler.
  - Toasts: `social-sent`, `social-shared`, `social-discarded`, `social-drafted`.
  - `DraftSocialButton({type, id})` — a server action calling `POST social-posts/draft`, then `redirect('/admin/social-posts?done=social-drafted')` (outside any `try`).
  - Settings → Social accounts: the LinkedIn card (client ID/secret fields through the settings form pattern, callback address to copy, Connect / Disconnect, organisation picker from `organizations` with a "type the ID" fallback input, expiry warning from 7 days before `expires_at`, last error) and an X note ("Posting to X directly needs a paid X developer plan; for now approved X posts open in X, filled in.").

- [ ] **Step 1: Build** types, lib, screens, button placements, nav, mock, audit lists, `social-text.ts` + its check script.
- [ ] **Step 2: Run** `php artisan test --filter=AdminNavRolesTest` (from api/) — PASS; `npx tsc --noEmit` — exit 0; `npx eslint` on touched files — clean; `node scripts/social-text.check.mjs` — pass.
- [ ] **Step 3: Verify** against the running dev server with a throwaway admin (create, delete after): publish a case study → two drafts appear; edit the X draft, approve → a new tab request to `x.com/intent/post` (assert the URL in the probe, do not load it); LinkedIn not connected → Copy and open; discard. Audits of the new routes, light and dark, and mobile — clean.
- [ ] **Step 4: Commit** `"C7: Social posts review screen, Draft button and Social accounts settings"`.

### Task 6: Docs, version and the gate

**Files:**
- Create: `docs/social-posts.md`, `manual/40-social-posts.md`
- Modify: `CLAUDE.md` (module line), `API.md`, `VERSION.md`, `web/src/lib/version.ts` (0.190.0), `web/src/lib/help-routes.ts`, regenerate `web/src/content/help.json` (`npm run help`)

- [ ] **Step 1: Write** the module note (the rules: review before anything posts; once per record; X by intent in this release and why; LinkedIn needs app approval and maybe no refresh token; 23-char rule; timeout is `unconfirmed`; drafts never fail a publish; the AI never writes a URL), the manual chapter (connecting LinkedIn: creating the app, adding the Community Management API product, what LinkedIn's review asks for, the callback address; reviewing and approving; what X does), API.md section, CLAUDE.md line, VERSION.md entry.
- [ ] **Step 2: Run** `node scripts/build-help.mjs --check` and `node scripts/help-routes.check.mjs` — clean.
- [ ] **Step 3: Run** the full API suite alone, `composer analyse`, `pint --test` — green.
- [ ] **Step 4: Run** the production-build audits (stop the dev server by PID, `rm -rf .next`, build, start, warm-images, `npm run audit`, `AUDIT_SCHEME=dark npm run audit`, `npm run audit:mobile` with a throwaway admin; delete it; restart `npm run dev`).
- [ ] **Step 5: Commit** `"0.190.0: LinkedIn and X posts (C7)"`.
