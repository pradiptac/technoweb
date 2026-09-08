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
