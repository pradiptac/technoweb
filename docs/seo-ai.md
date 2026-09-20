# The AI SEO assistant

An optional, admin-triggered assistant beside the SEO module that already
exists. It suggests; a person decides; nothing it produces reaches a public
page without somebody pressing Save.

Implementation: `api/app/Support/Seo/Ai/`, `api/app/Http/Controllers/Api/V1/Admin/SeoAiController.php`,
`web/src/components/admin/ai-seo-panel.tsx`. Settings live in the private `seo`
group. Off by default.

---

## What it is not

It is **not** the SEO analyser. `App\Support\SeoScore` is, it works with no
model and no key, and it is documented separately in `seo-score.md`. Nothing in
this module changes a score, and switching the assistant off leaves every SEO
screen exactly as it was.

Four checks the brief asked the analyser for — H1 exists, canonical exists,
schema availability, breadcrumb availability — were deliberately **not** added.
All four are structurally guaranteed here: the H1 is the record title and the
audit fails a page with anything but one, the canonical always resolves in
`buildMetadata`, `schema_type` always resolves through `defaultSeo()`, and
breadcrumbs are rendered by `PageHero`. They would be four checks that can never
fail, which inflates every record's score and re-baselines the snapshot in
`seo-score.md` in exchange for no information.

---

## The shape

```
editor presses a button
  → Laravel validates and refuses early (off / no key / cap reached)
  → SeoContext assembles the prompt
  → AiProvider::complete(messages, maxTokens, { model, response_format })
  → SeoAssistant validates the reply, key by key
  → a seo_suggestions row
  → the panel shows it
  → Apply puts it in the form; Save writes it, through the ordinary endpoint
```

The last two lines are the design. **Nothing in this module writes to
`seo_metadata`.** Applying a suggestion sets React state in `SeoPanel`; the
record changes when the editor saves it, through the same request, the same
`SeoRules` validation and the same `HtmlSanitiser` a typed value goes through.
`SeoAiTest::test_an_ai_call_writes_nothing_to_the_records_seo` pins it.

---

## Bulk runs, from the overview (2026-09-18)

Six buttons on one record's panel is a workflow for one record. The
overview already answers "which records fail this check"; **"Draft for
these N"** on it (`bulk-ai.tsx`) posts the rows on screen as `type:id`
pairs and one action to `POST /admin/seo/ai/bulk`, which queues one
`RunSeoSuggestion` job per record and answers at once. The assistant's
three refusals are made *before* anything is queued — a switched-off
assistant must not fill the queue with jobs that each refuse — a record
already holding a `pending` suggestion for that action is skipped rather
than billed twice, and nothing is queued past what is left of the day's
cap. The jobs run through the same `SeoAssistant::run()` as a button press,
so every rule above holds; they land as `pending` on each record's panel,
the overview badges the record (`ai_pending`) and `?ai=pending` is the
review queue. The control renders only with a filter applied: fifty records
drafted at once is a bill, and the filters are what name the ones worth it.
The queue is drained by the scheduler, like the mail; the response says
whether anything is draining it.

## A draft from what the site could not answer (2026-09-18)

`/admin/chat/unanswered` is the one measured list of demand on this site
— questions typed into the assistant that no page could ground. **"Draft
an article"** on a group posts its ids to `POST /admin/chat/unanswered/brief`;
`App\Support\Seo\Ai\ArticleBrief` writes a `draft` `KnowledgeArticle` —
title, excerpt, two to five sections, a "Questions people ask" block of Q&A
pairs (the FAQ half of the plan, kept in the body because an article is
not an FAQ owner), and a "Related" list chosen from the same numbered
candidate list `internal_links` uses — tagged `assistant-draft`, and the
group is marked handled with the draft's id. The rule that makes it safe:
**the model is given no facts, so it is told to write `[CHECK: what to
confirm]` wherever a figure, a model number, a price or a step would go**,
and the draft is the shape of the answer with holes where the knowledge
goes. Every key is read by name and bounded, the HTML is built here from
escaped text and cleaned like a typed body, and nothing publishes it.
`ArticleBriefTest` pins the shape, the escaping, the refusals and the role.

## Keywords, as a target (2026-09-18)

`keywords` is the seventh action: the one phrase the page should win, the
intent behind it, why that phrase and not a broader one, and up to six
secondaries. Apply puts the focus and the secondaries on the panel, so the
score's five `keyword_*` checks and the assistant chase the same phrase —
and every action's prompt now carries the record's stored focus and
secondary keywords with the rule to keep them, so a title generated after
a keyword is chosen is generated *toward* it.

## Alt text for the library (2026-09-18)

`image_alt` is a score check and the one accessibility gap a library of
hundreds of files cannot close one dialog at a time. **Suggest alt text**
in a picture's Edit dialog posts to `POST /admin/media/{id}/alt-suggest`;
`App\Support\Seo\Ai\AltText` sends the picture itself to a
vision-capable model as a `data:` URL — never a link, since the API's own
asset URL is `127.0.0.1` on a development machine — and hands back one
sentence under 125 characters, or an empty string for a picture the model
calls decorative. The sentence lands in the field for the editor to edit;
saving the dialog writes it, through the same `PATCH` a typed value goes
through. Raster formats only, under 4MB; the same refusals, cap and
counter as every other action. `AltTextTest` pins the data-URL transport,
the decorative verdict, the vector refusal and that nothing is written.

## Search Console in the loop, and what each model earns (2026-09-18)

Everything on the SEO screens until now was scored from what is stored.
`App\Support\Seo\SearchConsole` is the one input that comes from the
world: a service account's JSON key under Settings → API keys, the account
added to the property as a user, and the overview gains a **Search, 28d**
column (clicks over impressions, CTR, position) with a **Shown, never
opened** filter — twenty or more impressions and no clicks, the pages worth
rewriting first — while `SeoContext` lists the queries a page already
appears for, so `improve`, `generate` and `keywords` chase real demand.
No SDK: the account signs its own RS256 JWT with `openssl_sign`, one call
an hour for the whole overview, one per page per hour for the assistant,
a Google refusal in Google's words under `gsc_error` and the column simply
absent. `SearchConsoleTest` fakes both endpoints with a key made once.

And the question the client will ask after a month — which model to keep
paying for — is answered on the overview: `meta.ai.usage` counts what each
model suggested, applied and rejected over ninety days with an acceptance
rate that is **null while nothing has been decided**, never zero; and the
panel shows a suggestion *against* the value the form holds, struck
through, rather than as a sentence with nothing to compare to.

## Reuse, not a second integration

Everything about talking to a model already existed for the chatbot and is
shared: `App\Support\Chat\AiProvider` (bound in the container), `OpenAiProvider`,
`AiReply`, and the key in `integrations.openai_api_key` — encrypted, `is_secret`,
one credential for one provider, so it cannot be half-rotated.

**One additive change** was needed: `complete()` gained an optional
`array $options` carrying `model` and `response_format`. With an empty array the
request body is byte-identical, so the chatbot cannot move. It exists because
this caller needs a **per-feature model** — a meta description and a visitor's
question are not worth the same money — and **JSON mode**, which nothing in the
codebase had used before.

---

## The three rules that stop it inventing

### Links are selected, never composed

A model asked for internal links writes plausible URLs that do not exist. So it
is never asked for a URL: `SeoAssistant::candidates()` builds a numbered list of
real published solutions, services and product categories, and the reply carries
**indices into that list**. Anything outside it is dropped rather than clamped —
clamping would substitute a different page and leave the model's reason attached
to the wrong one. The record's own page is filtered out, because a page linking
to itself is the one suggestion that is always wrong and the likeliest one when
a solution is being asked about a list mostly of solutions.

### Schema is constrained to the allowlist

`SchemaTypes::for()` decides what a record may declare itself to be, and a
suggestion outside it is refused outright. This is what keeps "a dropdown is a
promise" true: `Recipe` on a network switch never reaches the graph, and there
is no raw-JSON escape hatch to route around it.

### The safety rules are code

`SeoContext::RULES` — never invent a certification, a statistic, a customer
name, a partnership or a specification; do not stuff keywords; do not promise a
price or a service level. They are appended **after** whatever the settings say,
so no amount of editing the business context can push them out.
`test_the_safety_rules_survive_emptying_every_context_setting` pins that.

---

## Two trust levels in one prompt

This is the part worth reading twice.

The business context is written by an **admin**, who can already change anything
about the install, so it sits at instruction level. The record's copy, its title
and the names of services and solutions are written by a **content manager** — a
service called *"Ignore previous instructions"* is a service somebody can create
from the ordinary CMS — so all of it goes inside `---WEBSITE COPY---`, and the
instructions say the fenced text is material and never a command.

The fence string is **stripped from the content it wraps**. Typing one into a
page body would otherwise end the block early and put everything after it back
at instruction level, which is the whole trick.

Getting this backwards would make the part of the prompt an editor most controls
the most trusted part of it.

---

## The business context is mostly derived

Four settings say what the database cannot: `seo_ai_business_type`,
`seo_ai_audience`, `seo_ai_locations`, `seo_ai_context`.

Everything else is read live. The services and solutions come from the published
catalogue, the places from the `locations` tree, the name and tagline from the
`general` settings. **They were nearly four more text boxes and that would have
been the mistake**: publish a tenth service and a typed list still says nine,
with nothing anywhere reporting the difference. Same argument
`LandingPageOpportunities` makes about earning existence from data.

`GET /admin/seo/ai/context` returns the assembled prompt and its approximate
token count, and the panel shows it behind "What the AI is told". A prompt
nobody can read is a prompt nobody can trim — the chatbot only knows its own is
718 tokens because somebody counted — and it is also where an operator would see
an injection attempt sitting in their own content.

---

## Cost

| | |
|---|---|
| `throttle:10,1` on the actions | one editor's afternoon |
| `throttle:6,1` on the model test | a button pressed while reading |
| `seo_ai_daily_cap`, default 100 | **the bill** |

The cap is a cache counter, `seo:ai:runs:<date>`, incremented **only after a
usable answer**. A refusal, an outage and an unreadable reply are all free — the
editor got nothing, and charging for it means an afternoon of a broken key
exhausts the day without producing a suggestion. `remaining` is null rather than
zero when uncapped, and the panel shows it *before* it bites, which is the whole
reason the chat overview has a "Today" block.

---

## Choosing a model

`App\Enums\AiModel` owns the list; `SettingController::optionsFor()` turns it
into a dropdown with no new UI, the way `image_quality` already works.

Two rules that differ from every other allowlist here:

- **A stored value outside the list is kept and sent unchanged.**
  `SchemaTypes::resolve()` falls back and `mail_transport` falls back to `smtp`;
  this must not, because substituting a cheaper model bills somebody for one
  thing while they believe they bought another. The console renders an
  unrecognised value as its own option, marked — `MailTransport`'s rule, not
  `SchemaTypes`'.
- **The list will go stale**, because providers ship faster than this
  application deploys. `POST /admin/seo/ai/test-model` makes one real call and
  reports **the provider's own words** on refusal — the
  `/admin/settings/mail/test` pattern. Press it for every model offered before
  trusting the list; a model id that does not exist fails silently otherwise.

---

## What is stored

`seo_suggestions`: the record, the action, the model, the result, the tokens,
who asked, and what was decided. `model` is a column here and deliberately is
not one on `chat_messages` — a chat reply is read in the moment, a suggestion is
reviewed days later against a bill.

Append-only in practice: only `status` and the two columns recording who changed
it ever move. Both decisions are reversible, so somebody who rejects a title and
reconsiders does not pay for the same call twice. Pruned by age
(`technoware:prune-seo-suggestions`, `seo_ai_retention_days`, 90 days, 7-day
floor).

---

## Deploying it

```bash
php artisan migrate
php artisan db:seed --class=SettingsSeeder   # idempotent
```

Then, **in the console** and not in the database — a settings row written
directly does not clear the cache:

1. Settings → API keys: the OpenAI key, if the chatbot has not already set one.
2. Settings → SEO defaults: switch **AI SEO assistant** to `1`.
3. Choose a model and press **Test**.
4. Fill in what the business does, who it sells to and where it operates.

With `seo_ai_enabled` at `0` the panel renders nothing at all, every endpoint
refuses before the provider is reached, and the public site is untouched.
