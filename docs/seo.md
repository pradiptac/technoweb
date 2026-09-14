# SEO: structured data, scores and the AI assistant

`StructuredData`, `SeoScore`, `schema_type`, the overview screen and the suggest-only assistant.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**All JSON-LD is built in `App\Support\StructuredData` and rendered by
`JsonLd`.** It used to be built where it was *rendered* — six helpers in
`lib/seo.tsx` plus five hand-rolled blocks inline in page components, eleven
files that all had to agree about what an Article is. They did not: the blog and
the case study both declared `dateModified: published_at`, so an article revised
two years later told Google it had never changed, and both named the
Organization as `author` while the record had carried `author_id` the whole
time. The frontend could only emit what a resource happened to expose; `sku`,
`dateModified` and the coverage pivot were all sitting in the database unused.

**Escaping stays at the sink and must not move.** `StructuredData` returns
arrays; `JsonLd` serialises and escapes `<` to its `\u003c` form. `JSON.stringify`
does not escape `<`, so a CMS field containing `</script>` closes the block and
everything after it becomes live markup — and `npm run audit` fails on any
JSON-LD block containing a literal `<`.

**`schema` is gated on `withSchema()`, never on the route.** A nested resource
inherits its parent's route name, so `routeIs('*.show')` made every product
inside `/solutions/networking` believe it was a detail view — each built a
Product graph, touched `brand` and `category`, and with `preventLazyLoading` on
the endpoint 500'd. `ProductResource` has carried a comment about this exact
trap for its `seo` key the whole time and it was walked into anyway, so there is
a test now: `StructuredDataTest::test_a_nested_record_carries_no_graph...`.

**Nothing in a graph is guessed.** `availability` is nullable with no default —
defaulting it to `InStock` would make every block look complete and would be a
claim about stock this business has never made. There is no `price` at all,
because the brief rules out anything transactional; Google will report a missing
price for Product and that is the correct outcome for a catalogue that does not
sell online. `graph()` prunes nulls **recursively**: a top-level filter leaves
`offers.availability: null` in the output, and a null in JSON-LD is a malformed
value for a declared field rather than "unknown".

**`LocalBusiness` is only ever emitted for a place.** It asserts a physical
presence, so putting it on every page of a site with one office is a claim to
serve everywhere from nowhere. A landing page about a place gets it; a catalogue
one gets `CollectionPage` — not `Product`, however tempting, because a listing
marked up as a single item is the structured-data equivalent of the thin page
the module exists to prevent.

**The AI SEO assistant suggests and never writes, and that is structural.**
`App\Support\Seo\Ai\SeoAssistant` stores a `seo_suggestions` row; applying one
sets React state in `SeoPanel`, and the record changes when the editor presses
Save — through the same endpoint, the same `SeoRules` and the same
`HtmlSanitiser` a typed value goes through. Nothing in the module touches
`seo_metadata`, which is why "AI must never publish" needs no rule anybody has
to remember. Off by default; switched off, the panel renders nothing and every
endpoint refuses before the provider is reached. Full account in
`docs/seo-ai.md`.

**It reuses the chatbot's provider rather than adding a second integration**,
including the one `integrations.openai_api_key` — one credential for one
provider, so it cannot be half-rotated. The single change to the chat side is an
optional `array $options` on `AiProvider::complete()` carrying `model` and
`response_format`; empty, the request body is byte-identical. It exists because
the SEO caller needs a **per-feature model** and **JSON mode**, neither of which
anything in this codebase had asked for before.

**Two trust levels go into one prompt and the difference is load-bearing.** The
four business-context settings are admin-authored and sit at instruction level.
The record's copy and the *names of services and solutions* are
content-manager-authored — a service called "Ignore previous instructions" is
one somebody can create — so all of it is fenced, and the fence is stripped from
the content it wraps. Getting this backwards would make the part of the prompt
an editor most controls the most trusted part of it.

**The catalogue in that context is derived, never typed.** Services, solutions
and places are read live on every call. Four more settings would have been the
obvious shape and the wrong one: publish a tenth service and a typed list still
says nine, with nothing reporting the difference — the argument
`LandingPageOpportunities` already makes. The "never invent a certification, a
statistic or a customer" rules are in **code** for the opposite reason: a text
box an editor can empty is a safety property somebody can switch off by
accident.

**Links are selected from a numbered list of real pages, never composed**, so a
hallucinated URL cannot be expressed; an index outside the list is dropped
rather than clamped, because clamping substitutes a different page and leaves
the model's reason attached to the wrong one. Schema is constrained to
`SchemaTypes::for()`, which is what keeps "a dropdown is a promise" true with no
raw-JSON escape hatch to route around it.

**`AiModel` is the one allowlist here that does *not* fall back.** A stored
model outside the list is kept and sent unchanged, and shown in the console
marked as unrecognised — `MailTransport`'s rule rather than `SchemaTypes`'.
Substituting a cheaper model silently bills somebody for one thing while they
believe they bought another, which is a different kind of wrong from emitting
slightly odd markup. The list will go stale, so
`POST /admin/seo/ai/test-model` makes one real call and reports the provider's
own words — the `/admin/settings/mail/test` pattern.

**`og_image_path` was scored for months with no field to set it.** The column
existed, `SeoRules` validated it, and `share_image` is worth 6 points — and the
shared `SeoPanel` had no input, so only landing pages could ever satisfy it. The
field is there now, which will move the `share_image` figures in
`docs/seo-score.md`.

**The SEO overview's Recheck does not `revalidatePath`.** That would refetch
the whole overview — 0.9s and 73KB, because the endpoint collects every record
to answer the duplicate checks — and re-render fifty rows to change one number,
with every score on screen blinking at once and nothing saying which was
rechecked. `GET /admin/seo/{type}/{id}` returns one row at 0.29s and 1.5KB, and
the row swaps its own score in.

**That endpoint still collects every record, and must.** Two of the thirteen
checks are "does another record publish this exact title" and the same for the
description, so a record scored in isolation cannot see a duplicate and comes
back with a score that is *too high*. A recheck quietly reporting better news
than the list is worse than no recheck at all.

**The Recheck button and the score it changes are in different `<td>`s**, so
they share a row-scoped context (`RowScoreProvider`). The provider renders no
DOM, which matters: an element between `<tbody>` and `<tr>` is invalid table
markup and browsers silently reparent it outside the table.

**`schema_type` is a dropdown, and it now does something.** It was free text
that *nothing read* — `StructuredData` decides `@type` from the model, so an
editor could type `Recipe` on a network switch and the markup would not
change. Turning it into a select made that worse rather than better: a text box
invites a guess, a dropdown is a promise. So `App\Support\SchemaTypes` owns a
short allowlist per derived base type, and every alternative is a **drop-in** —
same required properties, no new mandatory ones. `Article` may narrow to
`BlogPosting` or `NewsArticle`; a `WebPage` may become `AboutPage`,
`ContactPage` or `CollectionPage`. `FAQPage` and `ItemList` are deliberately
absent from those lists because both require a property the swap cannot supply,
and a page declaring itself an `FAQPage` with no `mainEntity` is marked up as
something it is not.

**`Product`, `LocalBusiness` and `JobPosting` have exactly one option**, and
their control is rendered **disabled with the reason** rather than hidden — the
same pattern as the mail panel's uninstalled transport and the media library
refusing to resize an SVG. Removing the field on some screens and not others is
a question an editor has to go and ask somebody.

**The allowlist is resolved on the way *out* as well as validated on the way
in.** `SeoRules::rules()` is static and has no record, so it checks the union;
`SchemaTypes::resolve()` narrows per record when the graph is built. A stored
value outlives the rule that accepted it, and the graph is the wrong place to
discover that — so a type the record cannot support falls back to the derived
one rather than throwing.

**The options are sent by the API, never listed in TypeScript.**
`resolvedSeo()` carries `schema_type_options`, because the console builds the
dropdown from it and Laravel validates against it — two hand-written copies of
one list of strings is exactly the drift nothing type-checks across the wire.
It is absent from `SeoResource`, so it never reaches a public response;
`JobOpeningResource` was returning the raw resolved array and now goes through
`SeoResource` like every other public resource, which is what keeps it that
way.

**A SEO score is out of what *applies* to a record, never out of everything.**
`App\Support\SeoScore` has each check declare whether it applies before it
declares whether it passed, and divides by the applicable weight. An industry
has no body column, so scoring it against the content checks would park every
industry in the fifties with nothing an editor could do — and a score you
cannot move is one nobody looks at twice. It also means setting a focus
keyword can *lower* a score, which is correct: four checks apply only once one
is set, and the alternative is a score that rewards leaving the field blank.

**Nothing in the score fetches the rendered page.** Every check reads what is
stored, so it can grade a draft that has never been published and cannot see
rendered Core Web Vitals or a broken outbound link. That is the trade, and it
is the same reason `email:dns` is banned on a public form: an uncontrolled
network call on the request path has already cost this project 12.5 seconds
once.

**A failed check and an issue are not the same list.** `with_issues` on
`/admin/seo` means the five conditions it has always meant. Scoring a title
*under* 30 characters is right; calling it an issue took that headline from 23
records to 48 out of 54, and a figure flagging nearly everything has stopped
pointing anywhere. Each check carries its own `issue` flag rather than a
constant naming the keys, so the distinction lives with the rule.

**A path in an API response that names a console route is not the API's own.**
`admin_path` on the SEO overview was spelled `blog-posts` and
`knowledge-articles` — the API's resource names — while the console serves
those at `/admin/blog` and `/admin/knowledge-base`. Two of nine record types
linked to a 404 from the one screen whose whole job is finding records to go
and edit, and nothing type-checks a string built on one side of the wire
against a route table on the other.

**Two record types carried `HasSeo` and were absent from `/admin/seo`.**
`JobOpening` and `StoreProduct` both had a working override row, a resolved
title and description, and a `sitemap_include` flag — and neither was in
`SeoController::ENTITIES`, so neither had a score, a duplicate-title check, or
a Recheck button. The gap is the same shape `admin_path` was caught by, just
further from a screen anybody opens every day: a vacancy is indexable, in the
sitemap, and emits `JobPosting` structured data for Google Jobs; a store
product is indexable, in the sitemap, and is what the shop actually sells.

**`StoreCategory` had no SEO capability at all, and the reasoning for that was
wrong.** Its own model carried no `HasSeo`, and `Store\CategoryRequest`'s
doc-comment said why: "a category description is a line under a heading, not a
page." `/store/categories/{slug}` is a real route with its own
`generateMetadata`, carried in the sitemap since the store shipped — a category
with something in it is a listing page indistinguishable in shape from
`ProductCategory`, which has had `HasSeo` from the start. The comment was
tested against the wrong question: whether it has a `status` a draft can sit
behind (it does not, correctly — taxonomy is not a stream of content), not
whether it is a page. `StoreCategory` now mirrors `ProductCategory` exactly:
`defaultSeo()` returning `CollectionPage`, the admin resource gating
`seo`/`seo_defaults` on `$detail`, the public resource exposing `seo` when the
relation is loaded, and a two-tab Content/SEO form replacing the single pane.

**The sitemap's `included()` filter had a real gap, under a comment that
explained why it didn't need one and was wrong.** `careers.map()`,
`storeCategories.map()` and `storeProducts.map()` all ran unconditionally,
publishing every vacancy and every store record regardless of
`sitemap_include` — the comment above the store block said
*"`store_products` carries no SEO override row, so there is no
`sitemap_include` to honour"*, which had stopped being true the day
`StoreProduct` gained `HasSeo` and was never corrected. Verified live: a
vacancy in this install (`hardware-engineer`) has carried `sitemap_include:
false` since 2026-08-31 and was being published anyway; after the fix it is
correctly absent.

**A category's public index has to eager-load `seo` for `included()` to see
it.** `StoreController::categories()` did not — `StoreController::products()`
already did, which is why the sitemap comment's claim about products was wrong
in one direction (products always could honour the flag) and right about
categories in the other (they genuinely could not, until the trait existed).
