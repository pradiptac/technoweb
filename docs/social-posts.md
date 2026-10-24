# LinkedIn and X posts (0.190.0, C7)

When the company publishes something worth announcing, the site prepares a
LinkedIn post and an X post about it, and a person reads them, edits them and
approves them. Nothing goes out unread. Spec:
`docs/superpowers/specs/2026-10-23-social-posts-design.md` ("Settled after the
builder check" overrides the sections above it). Reference: `API.md` "Admin —
social posts". Manual: `manual/40-social-posts.md`.

## The rules

- **Nothing posts without a person.** There is no auto-send setting. A draft is
  a row (`social_posts`, status `draft`) and only `POST …/approve`, by a
  `content_manager`, moves it towards a network. Approving is the review: the
  text sent is the text in the request, not the stored draft, so what the person
  read is what goes.
- **Four kinds of record, and only these.** `blog_post`, `case_study`, `event`,
  and `entry` **only when its content type's `preset` is `newsroom_releases`**
  (`SocialSubjects::PRESET`). Press coverage, testimonials and every other
  content type get no drafts and no button.
- **Visible is one definition** (`SocialSubjects::isVisible`): a blog post is
  `published` with `published_at <= now`; an entry is `Entry::scopePublished`
  (status, date and an active type); a case study or event is `published`. The
  draft button, the automatic drafts and the send all ask it, and a send
  refuses "That page is no longer published." when a record has since been
  withdrawn.
- **Once per record, automatically.** No automatic pair is made when any
  `source = publish` row exists for the record, so unpublishing and
  republishing makes none. A manual draft (`source = manual`) can be asked for
  any number of times, for a published record, by the Draft button.
- **When the automatic pair is made** (`SocialDrafts::onSaved`, a model `saved`
  hook): on the transition to visible — visible after the save and not before it
  — and, for blog posts and press releases, only when `published_at` is within
  the last 30 days. Without both, the first edit of every old post after deploy
  would draft it and spend the AI cap. A record published, unpublished and
  republished never gets drafts; the "once per record" rule already intends that.
- **The sweep takes only what the hook could not see.** A post saved with a
  *future* `published_at` is not visible when saved, and nothing saves it when
  the date passes. `technoware:draft-social-posts` (every ten minutes) takes
  published posts and press releases dated in the last 30 days whose
  `published_at` is later than `updated_at` — records saved with a future date —
  and drafts those. A record whose date was in the past when it was saved was
  drafted by the hook and is never the sweep's. The same command moves a post
  stuck in `sending` for five minutes to `unconfirmed`, the backstop for a
  process that died mid-send.
- **Imports and seeders never draft** (`SocialDrafts::suppressed`, mirroring
  `IndexNow::suppressed` and applied wherever that is, and around the demo and
  install seeders). A published import otherwise queues two AI runs per record.
  Editors use the Draft button for an imported record.
- **A draft that cannot be made never fails a publish.** `onSaved` catches
  everything and logs at `warning`; the sweep catches per record.
- **The draft exists at once, with plain text.** `SocialText::fallback` writes it
  from the title and summary and `ai_pending` is true; the queued
  `WriteSocialPost` job asks the writing assistant (`SocialSurface`, two calls,
  one per network, counted against `ai_writing_daily_cap`) and replaces the text
  **only if it is still the untouched fallback**. An editor's text wins. The
  automatic path has no person, so `SocialSurface` authorises a null user for
  this job alone. The network's rules ride in the shape line, because `Writer`
  has no slot outside its fence.
- **The model never writes a URL.** The site appends the link: X's text is
  followed by a space and the link; LinkedIn's link is attached as the article
  card and the LinkedIn text carries none, fallback included. A URL the model
  produces is stripped, and an answer with a `[CHECK: …]` marker is refused.
- **X counts a link as 23 characters, whatever its length.** The limit is 280
  with each URL counted as 23, so with the space and the appended link the
  editable text can be at most **256 plain characters** (`SocialText::xFits`:
  `xLength + 1 + 23 <= 280`; 256 fits, 257 does not). The resource sends
  `x_length`, the count X will make, so the screen and the API cannot disagree.
  LinkedIn's limit is 3,000 characters of commentary. Both are checked again at
  approval — the API refuses, whatever the screen allowed.
- **X is never sent through an API in this release.** Posting to X directly
  needs a paid X developer plan. Approving an X draft marks it `shared_manually`
  and returns `https://x.com/intent/post?text=<urlencoded>&url=<urlencoded>` as
  `meta.open_url`; the browser opens it with the text filled in and the person
  presses Post there. There is no X connection card, OAuth slot or sender. The
  spec's §2 describes how one would be built and is kept for that later release.
- **LinkedIn posts through the API once connected**, and falls back to the share
  page otherwise: when it is not connected, no page is chosen, the token has
  ended, LinkedIn said the token is dead (`social_linkedin_error`), or the
  approver pressed **Copy and open instead** (`manual: true`), approval marks the
  post `shared_manually` and returns
  `https://www.linkedin.com/sharing/share-offsite/?url=<urlencoded>`. That
  address carries no text — LinkedIn's sharer takes none — so the screen copies
  the text to the clipboard first and shows it to copy by hand if the browser
  refuses.
- **The URL is re-resolved at approval** from the record's current public path
  (`SocialSubjects::publicUrl`); the stored `url` is what the draft was written
  about, and a 301 covers the gap.
- **A send is bounded at 15 seconds, and not knowing is not failing.** A
  connection error or timeout, **or any 5xx**, is `unconfirmed`: LinkedIn may have
  made the post before it failed, and a retry would post it twice. The words are
  "We couldn't confirm LinkedIn received this. Check the page before trying
  again." Approving from `unconfirmed` needs `confirm: true`, which the screen
  asks for after "Check LinkedIn first". A clear 4xx refusal is `failed` with
  LinkedIn's own words (cut to 300 characters) and is retryable without a
  confirmation. A 401 also writes `social_linkedin_error`, so `ready()` is false
  until a person connects again.
- **Nothing is stranded in `sending`.** The claim is one conditional update
  (`draft`/`failed`, plus `unconfirmed` with `confirm`), so two presses send
  once. Past the claim, any `Throwable` becomes `unconfirmed` (cautious: a throw
  before LinkedIn was called needs a confirm too), and a record withdrawn
  mid-flight puts the post back to the status it had.
- **Statuses:** `draft`, `sending`, `sent`, `shared_manually`, `failed`,
  `unconfirmed`, `discarded`. Text can be edited in `draft`, `failed` and
  `unconfirmed` (one conditional update, so an edit cannot land on a post being
  sent). Discard works on the same three. `sent` and `shared_manually` are
  history.
- **Deleting a record deletes its unsent drafts** (`draft`, `failed`,
  `unconfirmed`, `discarded`); `sent` and `shared_manually` rows stay as history
  and show "The page has been deleted". An orphan draft would sit in the review
  list unsendable.
- **The LinkedIn connection is an administrator's** (`role:admin`), the rule
  every mailbox and calendar connection follows: `OAuthConnection::linkedIn()`,
  scopes `w_organization_social r_organization_admin`, the callback
  `/admin/settings/social/linkedin/callback` on the website's address. The
  review and approval are a content manager's, so a content manager with no
  connection is told on the review panel that an administrator can connect it,
  and is given no link they cannot use.
- **LinkedIn issues no refresh token to an ordinary app.**
  `OAuthProvider::issuesRefreshToken()` is false for it; the access token lasts
  about sixty days, its expiry is stored, and `ready()` is false once it passes.
  Settings warns from seven days before ("Reconnect LinkedIn by <date>") and says
  so once it has ended; until then drafts fall back to the share page. A
  disconnect keeps the chosen page for a reconnection.
- **Which page.** After the consent, one administered page is chosen
  automatically; with several the administrator picks one from the list, and if
  LinkedIn refuses to list them (`r_organization_admin` is part of the Community
  Management API review) the page's numeric ID can be typed.
- **LinkedIn's API is versioned by header.** `LinkedInPoster::LINKEDIN_VERSION`
  is `202610`, read from LinkedIn's versioning page on 2026-10-24. LinkedIn
  supports a version for about a year: move it forward before 2027-10.
- **The settings are a private group.** `social_accounts` — **not** `social`,
  which is the public profile-URL group `/settings` publishes. The client ID,
  secret, token, expiry, account, page and `social_linkedin_error` are in it; the
  token and secret are `is_secret`, encrypted, and appear in no response.
- **Every approve, discard and draft is in the activity log**, with the network
  and where the post ended up, never its text (`ActivityLogger`, routes
  `social-posts.approve|discard|draft`). `social_post` is in the morph map.
- **No network call in any test.** `Http::preventStrayRequests()` and
  `Http::fake()`; the X intent address is built, never fetched.

## Console

Content → **Social posts** (`/admin/social-posts`, `role:content_manager`): a
list filtered by status (waiting by default, with the count) and network, a
review panel per post with the text, a live count, the page's title and link, and
Approve. **Draft a social post** sits in the header row of a published blog
post, case study, event and press-release entry. System → **Social accounts**
(`/admin/settings/social`, `role:admin`) holds the client ID and secret, Connect,
the page choice and the expiry warning. The sidebar rows and `ScreenAccess` are
one change (`AdminNavRolesTest` compares them). The mock (`web/mock-api.mjs`)
answers the same routes.

## Not done, on purpose

Scheduling for later; posting without approval; Facebook, Instagram and other
networks; personal profiles; several pages per network; posting to X through
its API; uploading pictures to the networks (the article card takes the
page's own `og:image`); drafts for shop products, vacancies, tenders, pages or
any other kind. Each is a decision about what may speak for the company and can
be added one at a time.
