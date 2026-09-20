# Blog comments — a plan

Written to be argued with before anything is built. Nothing here is
implemented.

## What was decided already

- **A honeypot, not reCAPTCHA.** Every public form in this product uses the
  `website` honeypot, and adding reCAPTCHA would put a third-party script on
  the blog — which the consent banner would then have to gate, or the banner
  becomes a claim the site does not keep. It is also a request to Google on
  every article page for a feature most readers never touch.
- **Deferred until after the blog**, which is now done.

## The shape of the problem

An unmoderated comment form on a public page fills with spam within days.
Everything below follows from that single fact, so the design is ordered by it
rather than by what is quickest to build.

The reference screenshots showed comment, name, email, website and two
notification checkboxes. **The website field and both checkboxes are cut** —
see "Deliberately not built".

---

## The data

**`blog_comments`**

| column | why |
|---|---|
| `blog_post_id` | `cascadeOnDelete`: a comment on a deleted post is orphaned text nobody can read in context |
| `parent_id` | `nullOnDelete`, one level of replies only — see below |
| `customer_id` | nullable. Set when a signed-in portal customer comments, so their name cannot be spoofed |
| `author_name`, `author_email` | **snapshots**, the split an order item already makes against a product. A guest has no account to join to, and a customer who later changes their name must not silently rewrite what was published under the old one |
| `body` | plain text. See "Not rich text" |
| `status` | `pending` / `approved` / `spam` / `trash` — a PHP enum, the call `TicketStatus` made |
| `ip_hash`, `user_agent` | for rate limiting and spam scoring, never displayed |
| `approved_at`, `approved_by` | who let it through, the rule the customer approval queue follows |

**One level of replies, not a tree.** A thread deeper than one reply needs
indentation the mobile layout has no room for at 320px, and the moderation
screen then has to answer "what happens to the children when I delete the
parent" — which is a question with no good answer and one this blog does not
need. `parent_id` exists so a reply can be attached to a comment; a reply to a
reply attaches to the same top-level comment.

**Not rich text.** `HtmlSanitiser` exists and works, but pointing it at
anonymous input is a different proposition from pointing it at a
content-manager's. Comments store plain text and render escaped, with
paragraph breaks on blank lines. That removes stored XSS from the feature
entirely rather than defending against it — the same reasoning that keeps
`schema_type` an allowlist rather than free text.

**No avatars.** Gravatar is a request to a third party keyed on a hash of the
commenter's email address, on every article page. That is the consent banner's
problem again, for decoration.

---

## Moderation is the feature

**Every comment arrives `pending`. Nothing is auto-approved**, including from a
signed-in customer — a real account is not evidence about a particular comment,
and the moment there is one exception the queue stops being trustworthy.

The rule that matters, and it is the one this codebase already applies to
leads: **nothing is auto-filed as spam either.** Junk scores low and sits in
the queue. Auto-filing eventually hides a real reader whose comment was three
words, and the failure is silent and permanent.

`/admin/blog-comments`, `role:content_manager` — this is content, unlike leads.
Filters for status and post; bulk approve and bulk spam, because moderation is
done in batches or it is not done at all. Pending count on the dashboard tile,
beside the lead counts, and only for a role that can open it.

---

## Anti-spam, in the order things are cheap

1. **Honeypot** (`website`). Filled, the response is the ordinary success and
   nothing is stored — telling a bot it was caught tells it what to change.
2. **A minimum dwell time.** A form submitted under three seconds after render
   was not typed by a person. A signed timestamp in a hidden field, not a
   session — the page is statically prerendered.
3. **Rate limit per IP**, `throttle:5,10`. Comments are not something one person
   does five times in ten minutes.
4. **A link ceiling.** More than two URLs in a comment is the single strongest
   signal there is; it scores low rather than being refused.
5. **A score, with its reasons stored beside it**, the shape `LeadScore` and
   `SeoScore` both use — a number without its working is one nobody trusts.

No third-party spam service. Akismet is a paid API and sends every comment to
somebody else.

---

## The public side

- Comments render **server-side** under the post, so they are indexable and
  work with no JavaScript. Real content on the page, not a widget.
- The form is a `<Form action={…} state={state}>` — React 19 resets a form after
  a function action, refused or not, so a bare `<form>` throws away a comment
  somebody spent five minutes writing the moment the server refuses it.
- After posting: **"Your comment will appear once it has been read."** Not a
  fake instant append. A comment that appears and then vanishes on reload is
  worse than an honest wait.
- `comments_enabled` per post *and* site-wide, plus `comments_closed_after_days`
  — an old article is where spam concentrates.
- Structured data: `commentCount` and `comment` on the existing `Article` graph,
  built in `StructuredData` like everything else. Approved comments only.

## Notifications

One to the desk when a comment needs moderating, queued like the other
seventeen. **Batched**, not one per comment: a spam run would otherwise send
four hundred emails, and the notification that arrives four hundred times is
the one people filter.

Nothing to the commenter, which is why the two subscribe checkboxes are cut —
see below.

---

## Deliberately not built

- **"Notify me of replies"** — a mailing list keyed on an email address given
  with no confirmation step. It needs a token, an unsubscribe route, and a
  suppression check, or it is an open relay for annoying strangers. If it is
  wanted later it goes through `SubscriberIntake` like everything else.
- **A website field.** A public, `rel="nofollow"`-or-not link attached to
  anonymous input is the reason comment spam exists at all. Removing the field
  removes the motive.
- **Editing or deleting your own comment.** Both need identity, and identity
  needs an account.
- **Voting.** Nothing here would read it.

---

## Cost

Roughly comparable to the newsletter's suppression half: one table, one public
endpoint, one admin screen with bulk actions, a notification, a prune, and the
public rendering. Two sessions, most of it moderation rather than posting.

## The order to build it

1. Table, model, enum, and the public POST with the honeypot and the score.
2. `/admin/blog-comments` with bulk approve and spam. **Nothing is public until
   this exists** — a queue with no screen is a queue nobody empties.
3. Public rendering, the form, and the per-post switch.
4. Notification, structured data, prune.

Stopping after 2 leaves the feature safe but invisible, which is the right
place to stop if it has to stop.
