# AEO + GEO — the wire contract (2026-09-21)

The plan is `docs/aeo-geo-plan.md`; this is the exact shape every piece agrees
on. The API implements it; the console and the public site read it; the mock
API (`web/mock-api.mjs`) mirrors it. A deviation is a bug in whichever side
deviated, never a reason to change the other.

## 1. Answer blocks

Table `answer_blocks`: `id`, `blockable_type` + `blockable_id` (morph, the
`faqs` pattern — morph aliases from `AppServiceProvider`), `kind` (enum,
below), `question` (string 255, nullable), `answer` (text — plain, ≤ 600
chars; the *direct* answer), `detail` (longtext, nullable — rich text through
`HtmlSanitiser`, `cms` profile; the supporting explanation), `sort_order`
(unsigned int), `status` (`draft`|`published`, default `published`),
timestamps. Index on (`blockable_type`, `blockable_id`, `sort_order`).

`App\Enums\AnswerBlockKind`: `definition` ("What is it?"), `who_for` ("Who is
it for?"), `why` ("Why is it needed?"), `key_fact`, `feature`, `use_case`,
`comparison`, `step`, `question` (a free question with its answer).
`label()` per case; `heading()` = the section heading the public page draws it
under; `asksQuestion()` true for `question` and `comparison` (a `question`
column is required for those, optional otherwise).

Model `App\Models\AnswerBlock`, morph alias `answer_block`. Relation
`answerBlocks(): MorphMany` (ordered by `sort_order`) on: Page, Product,
StoreProduct, ProductCategory, StoreCategory, Brand, Service, Solution,
BlogPost, KnowledgeArticle, Industry. Trait `App\Models\Concerns\HasAnswerBlocks`
carries the relation and `publishedAnswerBlocks()`.

**Write**: every one of those entities' store/update requests accepts
`answer_blocks` (nullable array, replaced wholesale, `[]` clears, absent leaves
alone — the `faqs` rule) with rules in `CmsFieldRules::answerBlocks()`:
`answer_blocks.*.kind` `Rule::enum`, `.question` string ≤ 255 (required when
`asksQuestion()`), `.answer` required string ≤ 600, `.detail` nullable string
(sanitised — listed in `richTextFields()` as `answer_blocks.*.detail`),
`.status` in draft/published. `WritesCmsEntities::saveAnswerBlocks()` mirrors
`saveFaqs()`. Error keys `answer_blocks.N.field` map to the **AEO** tab.

**Read (admin)**: every admin detail resource carries `answer_blocks: [{id,
kind, question, answer, detail, sort_order, status}]` (index rows do not).
`meta.answer_block_kinds: [{value, label, heading, asks_question}]` on each
admin index (the `meta.transitions` rule: the console never retypes the list).

**Read (public)**: every public detail resource of those entities carries
`answer_blocks: [{kind, question, answer, detail, heading}]`, published only,
ordered; index rows do not. Absent key on an entity without the trait.

## 2. FAQs — owners widened

`FaqController::OWNERS` gains `product_category`, `store_product`,
`store_category`, `brand`, `blog_post`, `knowledge_article`, `industry`
(each `[Class, titleColumn, Label]`). Each model gains `faqs(): MorphMany`
(morph aliases exist). Those entities' requests accept `faqs` via
`CmsFieldRules::faqs()` and their controllers call `saveFaqs()`. Admin detail
resources carry `faqs`, public detail resources carry `faqs: [{question,
answer}]`.

**FAQPage gate**: `StructuredData::answerFaqs(iterable $faqs, iterable
$blocks): ?array` merges the FAQs and the `question`-kind answer blocks
(question → `name`, `answer` (+ `detail` as text) → `acceptedAnswer.text`)
and returns null under **two** entries. `IncludesSchema`'s graph adds it only
when non-null. Never an `FAQPage` over one question.

## 3. Product AEO

`store_products` gains `warranty` (string 255, nullable) and `applications`
(text, nullable); a pivot `store_product_service` (`store_product_id`,
`service_id`). Admin request accepts `warranty`, `applications`,
`service_ids[]` (replaced wholesale); admin + public store product resources
carry `warranty`, `applications`, `services: [{id, title, slug}]` (detail
only). The `Product` graph on a store product gains `additionalProperty`
(`PropertyValue` per spec-sheet row), `isRelatedTo` (related products as
`Product` stubs with `name` + `url`), `category` as a `Thing` with `name`.
`warranty` as `Offer.warranty` → `WarrantyPromise` with `description` only
when set. Nothing invented.

## 4. Entity block

Every public detail resource (the eleven above + CaseStudy) carries `entity`:
`{brand?: {name, path}, category?: {name, path}, solutions: [{name, path}],
services: [{name, path}], industries: [{name, path}], articles: [{name,
path}], faq_count: int}` — from **loaded** relations only (`preventLazyLoading`
is on), `[]` where a relation is not loaded or empty. Built by
`App\Support\EntityLinks::for(Model $record): array`, the one place the
relation → path mapping lives (`publicPath()` on each model, the SEO
overview's rule: paths, never URLs). The graph mirrors it as `about` (the
category/solution) and `mentions` (the rest) — `Thing` stubs with `name`
and `url` — and the `Organization` node gains `knowsAbout` (published
solution titles) and `areaServed` (active locations' names).

## 5. Scores

`App\Support\AeoScore::for(array $input): array` and `GeoScore::for(array
$input): array`, the `SeoScore` shape exactly: `{value, band, passed, checked,
failed: [{key, group, label, weight, hint}]}` (no `issues`). Input for both:
`type`, `title`, `body` (text), `has_body`, `answer_blocks` (kinds present, as
a list), `faq_count`, `entity` (the §4 block), `internal_links` (bool),
`author` (bool), `certifications` (bool, site-wide), `organization_complete`
(bool: name, address, phone, email, logo all set).

AEO checks (key → weight, group `answer`/`structure`/`links`): `definition`
10 (a `definition` block), `questions` 10 (≥ 3 `question` blocks + FAQs),
`faq_page` 8 (≥ 2, the FAQPage gate), `key_facts` 8 (≥ 1 `key_fact`/`feature`
or, on products, a spec sheet), `use_cases` 8 (≥ 1 `use_case`), `comparison`
6 (≥ 1 `comparison`; applies to products, store products, solutions,
services), `steps` 6 (≥ 1 `step`; applies to knowledge articles, services,
solutions), `direct_answers` 8 (every question block's answer ≤ 600 chars —
applies when there are question blocks), `internal_links` 6, `structured`
10 (the record carries a graph — always true here; applies to all).
GEO checks (group `entity`/`authority`/`content`): `organization` 12,
`brand_link` 8 (products, store products), `category_link` 8, `solutions_link`
8, `services_link` 8, `industries_link` 6, `articles_link` 8 (≥ 1 supporting
article), `first_hand` 10 (a `why` or `who_for` block), `author` 8 (posts,
articles), `certifications` 6, `definition` 8, `nap_consistent` 8 (site-wide,
from settings). Applicability rules per type live in the class, not the
caller.

`GET /admin/seo` rows gain `aeo: {value, band}` and `geo: {value, band}`
(full detail from `GET /admin/seo/{type}/{id}` as `aeo`/`geo` with `failed`);
`?aeo=poor|fair` and `?geo=poor|fair` filters; `meta.site_score` gains
`aeo` and `geo` averages. `?sort=aeo|geo` through `ListSort`.

## 6. Assistant actions

`SeoAiAction` gains `AeoAnalyze = 'aeo_analyze'`, `Questions = 'questions'`,
`AnswerBlocks = 'answer_blocks'`, `ImproveAnswer = 'improve_answer'`,
`FaqSuggest = 'faq_suggest'`, `GeoAnalyze = 'geo_analyze'`, `EntityLinks =
'entity_links'`, `ProductQa = 'product_qa'`, each with `label()`, `blurb()`,
`maxTokens()`, `needsBody()`. Result shapes (`SeoAiResult`):
- `aeo_analyze` / `geo_analyze`: `{summary, strengths[], gaps[],
  suggestions[]}`
- `questions`: `{questions: [{question, intent}]}` (≤ 8)
- `answer_blocks` / `product_qa`: `{blocks: [{kind, question?, answer,
  detail?}]}` (≤ 8; `kind` validated against the enum; `[MISSING: …]` kept
  verbatim in `answer`, never stripped)
- `improve_answer`: `{answer, detail}` for one block (input carries
  `block_id`)
- `faq_suggest`: the existing `faqs` shape
- `entity_links`: `{links: [{n, relation, reason}]}` from the numbered list,
  `relation` in solution/service/industry/article/product
`SeoContext` gains the answer blocks, the FAQs and, for a store product, the
facts (brand, SKU, GTIN/MPN, category, specs, features, price, availability,
warranty, applications) with the instruction that a missing fact is written
as `[MISSING: what]`. Suggestions land in `seo_ai_suggestions` as today;
**Apply** on `answer_blocks`/`product_qa`/`faq_suggest` writes through the
record's own update endpoint (the console composes the payload), never
directly.

## 7. Console

Entity forms gain an **AEO** tab (`fields: ["answer_blocks", "faqs"]` where
`faqs` was not already on another tab) drawing `AnswerBlocksField` (a
repeater: kind select from `meta.answer_block_kinds`, question, answer
textarea with a 600 counter, detail `EditorField`, status, `ReorderButtons`;
posts hidden JSON `answer_blocks` like `FaqField`) and `FaqField`, and the
AEO/GEO readiness panel (`AeoGeoPanel`: the two scores with their failed
checks from `GET /admin/seo/{type}/{id}`, and the assistant's buttons through
the existing `ai-seo-panel.tsx` with the new actions). `/admin/seo` gains
AEO and GEO columns (sortable) and the two filters.

## 8. Public rendering

`components/content/answer-blocks.tsx`: `AnswerBlocks({ blocks, className })`
renders the published blocks grouped by kind under `heading` as ordinary
content — `definition` first as a lede-style paragraph, `who_for`/`why` as
short sections, `key_fact`/`feature` as a checklist, `use_case` as cards,
`comparison` as a two-column table, `step` as an ordered list, `question` as
a `FaqList`-style accordion beside the FAQs. Mounted on every detail page
that has the trait, after the body and before the related sections. Nothing
hidden, no `sr-only`, no collapsed-by-default content except the accordion.
`components/content/related-entities.tsx` renders `entity` as "Related"
`Collection`s. `lib/llms.ts` adds each record's definition and questions.
