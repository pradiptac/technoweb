# AEO + GEO on the existing CMS and store — the short plan

The brief is `Claude Code — Implement AEO + GEO on Existing CMS & Store.md`.
Its §20 asks for inspection, then a short plan, then code. This is the plan
(2026-09-21). Nothing below is a second SEO system: every piece hangs off
something that already exists, and the list of what exists is the first
section because it decides the shape of the rest.

## What is already there

| The brief asks for | Already in the codebase |
|---|---|
| SEO foundation | `HasSeo` on 12 record types, `SeoScore` (a rubric scored out of what applies), `/admin/seo` overview |
| FAQs | `Faq` (`owner` morph) on solutions, services, products, pages, landing pages; `FaqController::OWNERS`; `StructuredData::faqPage()` |
| Structured data | `App\Support\StructuredData` builds every graph; `JsonLd` escapes at the sink; `Organization` with `@id`, `sameAs`, `PostalAddress`; `Service` with `areaServed`; `Product` + `Offer` on store products; `speakable` on articles and services |
| AI, admin-triggered, suggest-only | `App\Support\Seo\Ai\SeoAssistant` (`generate`, `analyze`, `improve`, `faq`, `internal_links`, `schema`, `keywords`), `seo_ai_suggestions` with Apply/Edit/Reject and `POST seo/ai/bulk`; `SeoContext` builds what the model is told; links chosen from a numbered list of real pages |
| Entity relationships | `product.brand`, `product.category`, `product_solution`, `solution_industry`, `location_service`, `related_product_ids`, `case_study.industry`, `related_solutions` on categories — MySQL, as the brief wants |
| Company entity | the `general`/`contact`/`social` settings groups, `PublicSettings`, the `Organization` node |
| AI-readable content | `/llms.txt`, `/llms-full.txt` (`lib/llms.ts`), and every public resource already answers structured JSON |
| Scores | `SeoScore` — the shape `AeoScore`/`GeoScore` copy |

So: **no new subsystem, three new tables at most, one new tab on the entity forms, and the assistant learns seven more actions.**

## 1. Answer blocks — one table, polymorphic

`answer_blocks`: `owner_type`/`owner_id` (morph map, like `faqs`), `kind`
(`definition`, `who_for`, `why`, `key_fact`, `feature`, `use_case`,
`comparison`, `step`, `question`), `question` (nullable — a definition has
none), `answer` (plain text, ≤ 600 chars: the direct answer), `detail`
(rich text through `HtmlSanitiser`, the supporting explanation),
`sort_order`, `status`. Owners: pages, products, store products, product
categories, store categories, brands, services, solutions, posts, knowledge
articles, industries. Edited as a repeater on a new **AEO** tab of each
entity form (`Tabs` — every panel stays mounted, `buildFormTabs` gets the
`answer_blocks.*` error keys), through one `AnswerBlocksField` component.
`kind` decides where the block renders (§10 of the brief): the page's
"What is it / Who is it for / Why / Key features / Use cases / Comparisons /
Steps" sections are the blocks of that kind, in order, drawn as ordinary
content by one `AnswerBlocks` component the detail pages mount. Nothing
hidden, ever.

## 2. FAQs — widen the owners, keep the table

`FaqController::OWNERS` grows to categories, store products, store
categories, brands, posts, knowledge articles, industries; each gains
`faqs(): MorphMany` and the morph map entries exist already. The entity
forms that lack an FAQ repeater get the one the solution form has. `FAQPage`
is emitted only when the owner has ≥ 2 published FAQs **or** ≥ 1 FAQ plus ≥
1 `question` answer block — `StructuredData` gains `answerFaqs()` that
merges both, and the resource gates it the way `withSchema()` gates the
graph, so no page carries an `FAQPage` over nothing (§3, §14).

## 3. Product AEO (§4, §5, §16)

Store products already carry brand, SKU, GTIN/MPN, category, specifications
(ordered), features, availability (three-valued), price, images, and a
`Product` graph with a real `Offer`. Add: `warranty` and `applications`
(plain text, optional) columns on `store_products`; `related_service_ids`
(pivot `store_product_service`) so a product page can list the services
that install it; the AEO tab's blocks; FAQs. The graph gains `isRelatedTo`
(related products), `category` as a `Thing`, and `additionalProperty`
from the spec sheet (it is on the page — §14's rule). Marketing `/products`
keeps its price-less catalogue graph. **No fact is generated**: the
assistant's `product_qa` action is given the product's own fields and told
to mark anything missing as `[MISSING: …]` (the `ArticleBrief` rule).

## 4. Entity graph (§6, §8, §9)

No new graph — the relationships exist; what is missing is that a page
does not *say* them. Each detail resource gains an `entity` block
(`brand`, `category`, `solutions`, `services`, `industries`, `articles`,
`faqs` as `{name, path}` lists, from the loaded relations) rendered as the
page's "Related" sections and mirrored in the graph as `about`/
`mentions`/`isPartOf`. The `Organization` node gains `knowsAbout` (the
published solutions' names), `areaServed` (the active locations), and
`makesOffer` is **not** added (the catalogue does not sell). Company data
stays in the settings groups it is in; `GeoScore` reads them.

## 5. Scores (§18)

`App\Support\Seo\AeoScore` and `GeoScore`, the `SeoScore` shape: checks
that declare whether they apply, weight, label, hint; scored out of what
applies; `failed[]` travels with the number. AEO checks: a definition
block, ≥ 3 questions, ≥ 2 FAQs, key facts/specs, use cases, a comparison,
internal links, steps where the kind of page has them. GEO checks:
organisation entity complete, brand/category/solution/service/industry
relationships present, ≥ 1 supporting article, first-hand content (a
`why`/`who_for` block), consistent NAP, authority (author on articles,
certifications on file). Two more columns on `/admin/seo`, `?aeo=`/`?geo=`
filters, and `meta.site_score` gains both. Never a word about "ranking".

## 6. The assistant (§11–13)

Seven actions on the existing `POST /admin/seo/ai/{action}` allowlist,
each a prompt in `SeoAssistant` with a typed result in `SeoAiResult`:
`aeo_analyze`, `questions`, `answer_blocks`, `improve_answer`, `faq_suggest`,
`geo_analyze`, `entity_links`, `product_qa`. `SeoContext` already assembles
the record, its relations, its FAQs and the numbered list of real pages;
it gains the answer blocks and the product facts. Suggestions land in
`seo_ai_suggestions` with Apply/Edit/Reject as today — Apply writes through
the record's own update endpoint, so `HtmlSanitiser` and the validators
apply and nothing is ever auto-published. Bulk through `seo/ai/bulk`. Off by
default with `seo_ai_enabled`; the public site never calls a model.

## 7. Public API and llms.txt (§15)

No new endpoint: every detail resource gains `answer_blocks[]`, `faqs[]`
(where they had none) and `entity`. `lib/llms.ts` writes each record's
definition and questions under its entry. `/llms-full.txt` gains the
answer blocks' text.

## 8. Admin UI (§17)

On the ten entity forms: an **AEO** tab (readiness score with its checks,
answer blocks, questions, FAQs, Product Q&A; buttons Analyze / Generate
questions / Generate answers) and a **GEO** tab (readiness score,
relationships as read-only chips from the loaded relations, internal-link
suggestions, authority signals; buttons Analyze / Suggestions). The
suggestion list is the existing `ai-seo-panel.tsx` with the new action
names. `/admin/seo` gains the two columns.

## Order of work and what each step proves

1. **Scores first** (`AeoScore`, `GeoScore`, the overview columns) — they
   define what "done" means for everything after, and they run on today's
   data, so the columns are honest from the first deploy.
2. **FAQ owners widened** — migration-free (morph map + relations), forms,
   `FAQPage` gating with its test.
3. **Answer blocks** — table, model, morph map, request rules, the
   repeater, the `AnswerBlocks` renderer on every detail page, the graph
   additions. `HtmlSanitiserTest` gains the `detail` field.
4. **Product AEO** — the two columns, the service pivot, the graph.
5. **Entity block** on the resources and the "Related" sections.
6. **The assistant's seven actions**, one at a time, each with a
   `SeoAiTest` case using the faked provider, and `[MISSING: …]` asserted.
7. **llms.txt**, mock API, `API.md`, `docs/seo.md`, `CLAUDE.md` one-liners.

Tests the brief lists (§20) map onto what exists: `php artisan test`,
`npm run audit` light/dark (JSON-LD escaping, one `h1`, contrast), the
sitemap and metadata tests, AI on and off (`seo_ai_enabled`), the store's
suite untouched, `npm run build`. Estimated size: ~40 files, three
migrations, no new dependency.

## Not doing, and why

- A graph database, a vector store, or a second search: §6 says MySQL.
- `AggregateRating`/`Review`: absent by rule (`docs/store.md`).
- A public "ask this page" endpoint: the chatbot already retrieves from the
  same content, and §11 keeps AI admin-triggered.
- Auto-generated comparison pages: the programmatic-landing-page rules
  (`docs/landing-pages.md`) exist to refuse exactly that shape.
