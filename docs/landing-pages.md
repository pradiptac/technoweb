# Programmatic landing pages and places

Brand × category and place × service pages that a thin page cannot publish; the locations tree.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**A landing page's URL is composed from records it does not own, so those
records have to move it.** `LandingPage`'s `saving` hook recomputes `path` and
writes the 301 — correct, and never enough, because nothing saved the page when
a **constituent** was renamed. Fixing a typo in a brand name moved every page
under that brand and wrote no redirect: live, ranking URLs turning into 404s
from a screen nobody associates with landing pages at all. `RepathsLandingPages`
hooks `updated` on Brand, ProductCategory, Service, Solution and Location and
re-saves what points at them. It survived review because the test that covered
it called `$page->touch()` after the rename — which proves the model event
fires and proves nothing about anything firing it. **A test that stages the
trigger by hand is testing the mechanism, not the wiring.**

**The path constituents re-save one row at a time.** A mass `update()` skips
model events, and the events are what write the path and the redirect — fast
and wrong there is a set of moved URLs with no redirects behind them, which is
the original bug reintroduced to save a query. Same reasoning as the CV prune.

**`published_at` is stamped in the model, not the controller.** It was on the
update path only, so the endpoint that could publish a page in one request was
the one that left the column null. On the model it holds for both endpoints,
the seeder and `technoware:landing-pages` alike.

**A location's level is validated against the tree that will exist, not the
payload.** The check used to return early unless the request carried
`parent_id`, so a PATCH sending only `level` skipped it — a city inside a state
could be promoted to `country` and the tree contradicted itself with every page
under it still resolving. Both fields are now read from the request where it
carries them and from the record where it does not. The check also runs
**downwards**: widening a node strands its children rather than itself, so
nothing on the edited row is wrong and a check that reads only that row sees
nothing.

**Places are a tree, and `state` is derived from it.** India -> West Bengal ->
Kolkata -> Salt Lake, via `parent_id` and a `LocationLevel` of country / state /
city / area. The `state` column is gone: a string beside a `parent_id` is a
second answer to one question, and the two disagree the first time a subtree
moves. `Location::state()` walks to the nearest state ancestor; `fullName()`
gives "Salt Lake, Kolkata, West Bengal" and leaves the country off, because
nobody says the country to somebody in it.

**The tree does not shape the URL.** Pages stay at `/locations/kolkata`, not
`/locations/west-bengal/kolkata` — nesting them would make a two-segment place
path indistinguishable in shape from `/locations/kolkata/networking`, which is
the ambiguity `landing_pages.path` exists to avoid. Slugs are unique across the
whole tree for the same reason.

**A cycle is invisible, so it is refused in validation.** Every node in a loop
still resolves and still renders; it is simply unreachable from a root, so a
branch disappears from the site and nothing reports an error.
`Location::wouldCycle()` and a level check (`canSitUnder`) are enforced in
`LocationRequest`. A level may be *skipped* — a city directly inside a country
is ordinary, and forcing an invented intermediate row produces a page about a
region nobody searches for. `parent_id` is `restrictOnDelete`, and the
controller refuses first with a sentence naming the children.

**`location_service` and `location_solution` replaced a heuristic, and that is
the most important change in the location half.** The generator used to pair
every place with the first two published services — an arbitrary combination an
editor then had to invent copy for, which is the shortest path there is to a
template with a noun substituted in. Now the pairing is a fact somebody
entered: `LandingPageQuality` refuses a `<service> in <place>` page unless the
service is ticked on that place, and `LandingPageOpportunities` proposes only
what is ticked. It is also what `areaServed` in the structured data is built
from, so the panel on the page and the markup a crawler reads cannot drift.

**Substance is never inherited up or down the tree.** Kolkata having a response
time does not let West Bengal publish. A state page assembled from its cities'
facts says nothing about the state, which moves the template problem up a level
rather than solving it.

**Programmatic landing pages exist, and the whole design is about refusing to
make them.** `/brands/{brand}`, `/brands/{brand}/{category-or-solution}`,
`/locations/{place}` and `/locations/{place}/{service-or-solution}` are
generated from combinations the catalogue already supports. The brief that
asked for them also named the risk — thousands of thin pages is a manual action
against the whole domain — so the module is built so a thin page **cannot be
published**, rather than being discouraged from it. Five rules, each blocking a
different route to a doorway page:

1. **Existence is earned from data, never enumerated.** `LandingPageOpportunities`
   asks the catalogue which intersections hold stock. Against the seeded
   catalogue the grid holds **160 combinations and it returns 2** — the other
   158 are pages about hardware nobody carries.
2. **Publication is gated server-side**, in `LandingPageRequest::withValidator`,
   returning 422 with the reasons keyed on `status`. Not a warning in the
   console: the failure mode is two hundred pages, and a warning is what
   somebody clicks past on a Friday.
3. **Near-duplicate intros are refused.** The check that matters, because it is
   the only one a determined template does not survive — a second page with the
   city swapped has evidence, length and its own title. See `TextSimilarity`.
4. **Distinct title and description**, on the same length bounds as `SeoScore`,
   read from that class rather than copied.
5. **A cap on published pages** (`landing_page_cap`, private `seo` group,
   default 40). The only rule about the set rather than the page, and the only
   one somebody has to raise deliberately.

**A landing page is `role:seo_manager`, not `content_manager`.** It is not
content — it is a decision about which queries the site competes for, and
getting it wrong costs the ranking of pages nobody touched. Same role that owns
the redirect table and the SEO overview.

**`TextSimilarity` is shingles, not `similar_text`.** Five-word runs, Jaccard.
`similar_text` is a longest-common-substring measure with no notion of word
order, worst-case O(n³), and it reports ~80% for two paragraphs that share
nothing but English. The threshold — **0.35** — was measured rather than
picked: on realistic copy a paragraph with the city name substituted scores
0.67, one with the city *and* a clause reworded scores 0.55, and two intros on
the same subject written separately score **0.00**. Nothing at all falls between
0.01 and 0.54, so the line sits in an empty band rather than at the edge of
either population. `tests/Unit/TextSimilarityTest.php` pins both ends; do not
move it without re-measuring. Stop words are deliberately *not* stripped — they
are most of what makes one sentence structurally identical to another, which is
the signal being looked for.

**`landing_pages.path` is the identity, and resolution is one lookup.**
`/products/[slug]` has to try the category endpoint and then the product
endpoint because two kinds of record share a segment; that cost is documented
and this deliberately does not repeat it. The whole path is a unique column, the
frontend is two catch-all routes hitting `/landing-pages/lookup?path=`, and a
page can be re-pointed without its URL moving.

**`Sluggable` is not used on `LandingPage`, and that is not an oversight.** That
trait owns one slug and writes a 301 from `urlPrefix()/old`. A landing page's
URL is composed from two or three *other* records' slugs, so renaming a brand
moves it without anything on its own row changing. The model recomputes `path`
in a `saving` hook and writes the redirect from old to new — same guarantee,
arrived at differently. `tests/Feature/LandingPageTest.php` pins it.

**Nothing seeds a location, and nothing should.** A `locations` row is a claim
that engineers attend sites in that city. Inventing them is the doorway pattern
*and* a false statement about the business — the same mistake as the invented
Mumbai address already on the must-not-ship list. A location may be created with
just a name, and no page about it may be **published** until one of
`office_address`, `response_time` or `summary` is filled in: a page that names a
city and says nothing specific about it is a template with a substitution.

**The location half is proposed on a shorter leash than the catalogue half.**
`LOCATION_SUGGESTIONS = 2` caps how many service and solution pages are offered
per place — six services in five cities is thirty drafts, which is thirty
introductions somebody will write from one template. The place's own page is
always offered first, because it is the one page per city unambiguously worth
having.

**`technoware:landing-pages` reports by default and never publishes.**
`--create` is opt-in, `--limit` defaults to 10, and everything it makes is a
draft with an empty introduction — which is exactly a page the gate refuses.
The machine proposes; nothing it proposes reaches the public site without
somebody writing prose that is not a near-duplicate of prose that exists.

**A refused publish saves nothing.** The request is rejected whole, which is
right for an API and unkind on its own — so the form says so, and says the text
is still on screen. That last sentence used to be a lie, and it read as a
reassurance, which is worse than saying nothing: see the note on `Form` below.
