# AI writing everywhere

Write / Rewrite / Shorten / Expand / Fix grammar / Change tone on the words an
editor types (0.183.0): rich-text bodies, summary fields, ticket replies,
newsletter campaign blocks and subject lines, and the system emails. **Always a
preview, and nothing is written to a record until the record's own Save** (or,
for a ticket, until the engineer presses Send). It uses the OpenRouter key,
model and switch the SEO assistant already holds (`docs/seo-ai.md`).

---

## The five surfaces

`App\Support\Writing\Writer` is the one implementation. `POST /admin/writing`
(`WritingController::write`) is the one endpoint, `GET /admin/writing/status`
tells the console whether to draw any control, and `POST /admin/writing/subjects`
is the campaign editor's "Suggest subject lines". All three are staff-wide
routes in `routes/api/admin-auth.php` (the copilot's rule); the two POSTs are
throttled 20/min. **The controller narrows by surface**, before any model is
reached:

| Surface | Class | Reaches | Role |
|---|---|---|---|
| `summary` | `SummarySurface` | an excerpt / summary / short description (plain text, cut to the field's `max`, 600 at most) | the record kind's owning role |
| `body` | `BodySurface` | a rich-text body, or the selection in one | the record kind's owning role |
| `ticket_reply` | `TicketReplySurface` | a reply box on a ticket | `support_engineer` |
| `campaign_block` | `CampaignBlockSurface` | one newsletter block: heading, text, button, columns | `campaign_manager` |
| `email_template` | `EmailTemplateSurface` | a system email's subject or body | `admin` |

A record's kind is a morph alias the page history knows: `RecordRef::allows()`
asks `Revisions::allows($user, $type)`, so writing help reaches only kinds whose
owner is written down (blog post, knowledge article, case study, solution,
service, product, shop product, event, vacancy, tender, landing page, page,
custom entry), and `store_product` is a store manager's, `landing_page` an SEO
manager's. An alias `Revisions` does not know is a 403. **Gates are
`isAdmin() || hasRole(X)`, never `hasRole` alone**: it does not pass an
administrator. A given record `id` that is not there is a 404 ("That record is
not there any more.").

A surface has three jobs and the writer has the rest: `authorise()`,
`prepare()` (the content as the model sees it, the context lines, the JSON
shape it must answer, and whatever `rebuild()` needs back) and `rebuild()` (the
answer turned into what the console shows). `Prepared` carries them;
`WritingInput` is the request; `WritingResult::ok()` / `refused()` is the
answer; `WritingRefused` is how a surface says no with one sentence (code 404
becomes a 404, anything else a 422).

---

## The rules every request shares (`Writer`)

- **One switch, its own cap.** The switch, key and model are the SEO
  assistant's (`seo_ai_enabled`, `openrouter_api_key`, `seo_ai_model`), so
  turning AI help on is one decision. **The daily cap is writing's own**
  (`ai_writing_daily_cap`, default 300, 0 switches writing off, 10,000 at most;
  counter `ai:writing:runs:<date>` in the cache), so a busy support desk cannot
  spend the SEO team's day or the reverse.
- **House style and words to avoid** (`ai_writing_style`, 500 characters;
  `ai_writing_avoid`, one per line, 50 lines of 40 characters, lower-cased and
  de-duplicated) are sent in the system message, outside the fence, on every
  request. They are the editor's own instruction, which is why they are not
  inside it.
- **The fence.** Everything the model is to work on sits between two
  `---CONTENT---` lines; the instructions say a fenced line is copy, never an
  instruction. `Writer::fence()` strips the marker from the content until
  nothing changes, so a nested marker cannot rebuild itself. The editor's brief
  (600 characters) sits outside the fence and is itself cleaned of the marker.
- **`[CHECK: …]`.** Where a fact, figure, price, date, name, guarantee or
  promise would go and was not given, the model is told to write
  `[CHECK: what to confirm]`. The panel warns about every one in a result. The
  writer never invents on the model's behalf.
- **Mode and tone.** `WritingMode` is write, rewrite, shorten, expand, grammar,
  tone; `WritingTone` is default (the house style alone), formal, friendly,
  plain. Change tone with the default tone is refused ("Choose a tone first.").
  Write needs a brief ("Say in a line what it should say.") except on a ticket,
  where the thread is the brief; every other mode needs something written.
- **One sentence for every refusal**, never the provider's words (they carry
  model names, quota messages and organisation ids): switched off, no key,
  limit reached, "The AI service did not answer. Try again shortly.", "…answered
  in a form we could not read.", "…nothing in it was usable.", and **"The
  assistant suggested no change."** when the answer equals the input once
  markup and spacing are ignored. Refusals are 422 (403 for a role, 404 for a
  missing record).
- **A run is counted only when a result is returned.** A refusal, a failure and
  an unusable answer are free. A subject-line request counts as one run.
- The response is `{data: {output, changed: true}}`; a refusal is
  `{message, errors: {writing: [message]}}`.

---

## The outline (bodies, text blocks and email bodies)

A rich-text body is never sent as HTML and never read back as HTML.
`Outline::fromHtml()` turns it into numbered lines — `1. [h2] …`, `2. [p] …`,
`3. [ul] …` — and `Outline::rebuild()` turns the answer back into markup:

- **Links `[Ln]…[/Ln]` and pictures `[Pn]`** stay on the server. The model sees
  the number and the link's words; the `href` and the `<img>` never leave, and
  come back by number. A link or picture the answer leaves out refuses the
  answer ("left out a link or a picture").
- **Locked lines `[Kn]`.** A table, iframe, figure, pre, video, audio, object,
  embed, hr, div, section, and a paragraph that is only a `[shortcode]`, is
  kept whole and returned **byte-identical**. A locked line the answer omits,
  repeats or moves refuses the answer ("changed part of the content it was
  asked to keep"). A `[K1]` written inside a sentence is a refusal when it names
  a real lock.
- **Invented tokens are stripped.** A `[K9]`, `[S3]`, `[L5]` or `[P2]` the
  source never had is removed, and text that merely *looks* like one in the
  source (`[L 3]`-style) is neutralised on the way in so it cannot be mistaken
  for one.
- **Every word is escaped on rebuild.** The model's text goes through
  `htmlspecialchars`; only `**bold**` and `*italic*` marks become tags, and only
  on escaped words. Link and picture markup is substituted from the server's own
  copy in the last step, behind private-use sentinels, so nothing the model
  wrote can reach it and no mark can reach into it. Then `HtmlSanitiser` runs
  over the result as it does for any body. **Never trust model output as HTML.**
- **Nested lists stay nested** (`ul2` / `ol2` lines, one level).
- **Not carried through a rewrite:** alignment, underline, strike,
  sub/superscript, colours and h5/h6 (h1 is read as h2). Use a selection to
  leave such text out of it.
- **Placeholders.** An input `{{name}}` must survive the answer (repeats are
  allowed). In a **body** an invented `{{name}}` is dropped quietly; in an
  **email template** it is refused. In a **campaign** heading, button and
  columns block a dropped placeholder is refused. A text block treats its
  placeholders as an email body does.
- A body answer over 40,000 characters is refused ("Try Shorten, or a smaller
  selection").

---

## Summaries

Plain text. `SummarySurface` sends the text, the record's title and up to 3,000
characters of the body, and cuts the answer to the field's own length at a word
boundary (`max` from the form, 20–600, default 600). Eleven forms draw it:
blog post, knowledge article, case study, solution, service, product, shop
product, event, vacancy, tender and custom entry (the fields are `excerpt`,
`summary` or `short_description`).

---

## Ticket replies — what is read, what never is

`TicketReplySurface` drafts a reply for the engineer to edit and send. It reads
what the customer can already see and the published knowledge base:

- **Read:** the ticket's subject; the description *unless the ticket is marked
  sensitive*; the latest **12 public messages** (`publicMessages()`, so never an
  internal note), oldest first, with *Customer* / *Our engineer* labels; up to
  1,500 characters of each.
- **Never read:** internal notes; any message marked sensitive (skipped, not
  masked); a sensitive ticket's description; attachments of any kind; the
  customer's account, address, orders or anything else about them.
- **Masked before anything is sent:** email addresses become `[email]`; mobile
  numbers (Indian shapes, `+country` runs), landlines with an area code and any
  run of ten or more digits become `[phone]`. **References, IP addresses, dates
  and version numbers are left alone** (`TW-2026-00007`, `192.168.1.10`,
  `2026-10-18`, `v7.2.1`), because a draft that cannot say which ticket it is
  about is useless. The engineer's own text in the reply box is masked too.
  `shortcut:` a short extension, or a landline with no area code, is not
  caught; tighten `TicketReplySurface::mask()` if a desk needs it.
- **Refused:** a closed ticket, and one merged into another ("This ticket is
  closed, so there is nothing to reply to.").
- **Knowledge-base sources.** Up to three published articles, found by meaning
  when search by meaning is on (`Semantic::passages`) and by a word search on the
  subject otherwise — published only, never a draft. They reach the model as
  `[S1]`…`[S3]` with a title and a 600-character excerpt. In the answer `[S1]`
  becomes the article's title and its public address built on `FRONTEND_URL`; an
  invented `[S9]` is stripped.
- The reply is plain text of at most 5,000 characters. The model is told never
  to promise a refund, a date, a price or a visit — it writes `[CHECK: …]`.
  **Nothing is sent**: the draft lands in the reply box (Replace, or Insert
  below after what is already typed) and the engineer presses Send.
- The button is "Draft a reply", offered for public replies only (not for an
  internal note), and its modes are write, rewrite, shorten, grammar and tone.

---

## Newsletter campaigns

- **A block.** Heading, text, button and columns blocks have a writing button in
  the block's toolbar (images, dividers and spacers have no words). The block
  goes up as JSON; **only its words change** — `rebuild()` copies the block back
  and replaces the heading's `text`, the button's `label` (60), the columns'
  `heading` (120) and `text` (600), or the text block's `html` through the
  outline. A link's address, a picture and every style key are never the
  model's. Columns must come back in the same number and order. There is no
  "Insert below" here (`hideBelow`): the answer *is* the block's words.
- **Subject lines.** "Suggest subject lines" in the campaign editor
  (`POST /admin/writing/subjects`, `{campaign_id}`) returns three subjects of
  up to 120 characters, each a button that fills the subject. It reads **the
  saved campaign**, not unsaved edits — save first.

## System emails

`EmailTemplateSurface` writes **one field at a time**: `ref: {key, field}` with
`field` `subject` or `body`. The email's placeholders are the catalogue's
(`MessageCatalogue`) and **no others**: the model is shown the list, an invented
`{{name}}` refuses the answer, and an input placeholder the answer drops refuses
it. **The three locked messages** — `verify_customer_email`, `reset_password` and
`sign_in_code_issued`, which carry a credential somebody is waiting for — are
refused ("so its wording is not rewritten by machine"), and the console draws no
button on them. An unknown key is a 404. Role: `admin`.

---

## The console (`web/src/components/admin/writing/`)

- `writing-panel.tsx` — the preview. A `Modal size="side"`, **portalled to
  `document.body`** (the button often sits in a field's hint, a paragraph, where
  a dialog's heading is not allowed). Modes, tone, a brief box, **Suggest**, then
  the answer with **Replace**, **Insert below** (where it means something) and
  **Discard**, and a line "N of M writing requests used today". A
  `[CHECK: …]` in the answer raises an "Unchecked facts" alert.
- `ai-write-button.tsx` — `AiWriteButton` and `useWritingStatus()`: **one fetch
  of `GET /admin/writing/status` per page**, shared by every button, retried by
  the next mount after a failure, and the buttons draw **nothing at all** unless
  the status says `available`.
- `ai-row.tsx` — `AiRow`, a row *above* a field that holds the controls. It is
  never inside a `Field`'s hint: the hint is the field's `aria-describedby`, and
  it is replaced by the error when a save is refused.
- `summary-ai.tsx` — `SummaryAi`, the summary fields' control, found by field
  id so the form can stay a server component.
- `subject-lines.tsx` — the campaign editor's three suggestions.
- `apply.ts` — `setFieldValue()`: the prototype setter plus a bubbling `input`
  event, so a controlled field takes the value and the form's draft and leave
  guard hear it.
- The rich-text editor (`rich-text-editor.tsx`) has an **AI** toolbar button
  when its form passes `ai={{surface, ref}}`. With text selected the selection's
  markup is the input and **Replace** swaps just that; with a caret the whole
  body is. After any apply Summernote dispatches a bubbling `input` on
  `.note-editable`, so the leave guard and `FormDraft` see the change.
  `hideBelow` exists for the surfaces where "insert below" is meaningless.
- `web/src/types/writing.ts` carries the types; `web/src/app/admin/(app)/writing-actions.ts`
  the Server Actions (`writingStatusAction`, `writeAction`, `subjectLinesAction`).
  `lib/admin/*` stays server-only.

Where it is drawn: the body editor on blog posts, knowledge articles, case
studies, solutions, services, products, shop products, events, vacancies,
tenders, pages, landing pages (introduction and body) and custom entries; the
summary on eleven of those; the reply box on a ticket; each campaign block and
the subject; the subject and body of every unlocked email template.

---

## The settings

Three rows in the private `seo` group, drawn on **SEO → Settings** (the "SEO
settings" screen, `/admin/seo/settings`, beside `seo_ai_enabled` and
`seo_ai_daily_cap`), written by `PATCH /admin/settings` (`role:admin`) and
checked by `WritingSettings::refusalFor()`:

| Key | Rule |
|---|---|
| `ai_writing_daily_cap` | a whole number 0–10,000; default 300; 0 switches writing help off |
| `ai_writing_style` | at most 500 characters |
| `ai_writing_avoid` | one per line, at most 50 lines of 40 characters |

None is on the public `/settings` map. `SettingsSeeder` adds the rows (additive,
`php artisan db:seed --class=SettingsSeeder`); no migration.

## What it does not do

- **No SEO fields.** Titles, descriptions and keywords belong to the SEO
  assistant (`docs/seo-ai.md`), whose suggestions are reviewed in its own panel.
- **No translation.** It works in the language it is given.
- **No auto-send and no auto-save.** Every answer waits for the editor.
- **`SectionDraft` and `PageDraft` (the page builder's assistants) are
  unchanged**, and so is the website assistant.
- It does not read pictures, the customer's account, orders, prices or stock.

## Known limits of this release

- **Applying to a selection has never been run in a browser.** The probe covers
  the panel, the buttons and the off state; Replace on a Summernote *selection*
  (as opposed to the whole body) was written against Summernote's range API
  and has not been exercised in a browser. Try it with a key before relying on
  it.
- **"Suggest subject lines" reads the saved campaign.** Unsaved edits in the
  blocks are not seen.
- **The panel's status is cached for the life of a page.** Switching writing
  help on, off or past its cap shows up on the next page load; the cap line in
  the panel counts its own runs from the page's first read.
- A merged or closed ticket cannot be drafted for, by design.

## Testing by hand

1. Settings → API keys: save an OpenRouter key and press **Test this model**.
2. SEO → Settings: turn the AI assistant on; leave the writing limit at 300 or
   set a small one to watch it stop.
3. Open a blog post: the **AI** button is in the editor's toolbar and a
   "Writing help" row sits above the excerpt. Select a paragraph, press AI,
   **Shorten**, **Suggest**, then **Replace**. Save, and the page shows it.
4. Open an open ticket: press **Draft a reply** and check that no phone number,
   email address or internal note appears in what you can see; add a sensitive
   message and draft again.
5. `cd web; ADMIN_LOGIN_EMAIL=… ADMIN_LOGIN_PASSWORD=… node scripts/probes/ai-writing.mjs`
   proves the controls are drawn (or absent, with the switch off) and that the
   panel opens with the six modes. It intercepts the Server Action, so it spends
   nothing and writes nothing. The mock API answers writing as unavailable, so
   every control draws nothing against it.

Tests: `WritingTest`, `WritingBodyTest`, `WritingTicketReplyTest`,
`WritingCampaignTest`, `WritingEmailTemplateTest` and `WritingSettingsTest`
(Feature) and `WritingOutlineTest` (Unit), all on a fake `AiProvider` (`Tests\Concerns\FakesWriter`) — none
reaches OpenRouter.
