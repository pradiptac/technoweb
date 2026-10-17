# Search by meaning

The site search and the website assistant also find published content by what
it means (0.182.0): "network keeps dropping" finds the Wi-Fi troubleshooting
article and the managed-switches page although neither uses those words. It
uses OpenRouter's embeddings endpoint with the key every AI feature already
holds.

**Off by default, and off is exactly the old search.** `semantic_search_enabled`
is a boolean row in the private `semantic_search` group (read through
`SemanticSettings::enabled()`, which compares to `true` — `Setting::get()` hands
a boolean row back as a bool). Switched off, nothing is indexed, nothing is
queued, no request leaves the server, and `Semantic::match()` answers `[]`.

---

## What is indexed

**`App\Support\Search\Indexable` is the one list**: fourteen kinds (solutions,
services, industries, product categories, products, shop products, knowledge
articles, posts, case studies, pages, events, tenders, downloads and custom
entries), each with the published scope its own public read uses — never a
second definition of "published". Industries and product categories have no
status and are always public.

**FAQs and answer blocks are not kinds.** They are read into their **owner's**
document (`Document::sections()`), so a draft owner's questions are never
searchable: `Indexer::index()` asks `Indexable::isIndexed()` *before* it reads
the record, because `Document` reads `faqs()` with no status check of its own.
A record that is not published has its passages removed at once.

A document is the summary, the written body split at its h2/h3 — or the visible
builder sections, never both, since the page draws one — the published answer
blocks, the FAQs, and for a product its brand, category and spec sheet. Never a
price, stock, a date or a reference: they change too often to be meaning, and
the shop's live data is not worth a vector. Builder sections are read through a
whitelist of prose keys, so nothing else a section stores is ever sent.

## Passages and re-embedding

`Passages::split()` cuts a document into passages of about 250 words (400 at
most, 2,000 characters) at its headings, each prefixed with the record's title
so a passage means something alone. A short chunk joins the previous one; a
short intro stays its own passage. Words are counted for every script
(`\p{L}\p{M}\p{N}`, and the danda), and an over-long run is cut into
1,800-character pieces.

**A passage whose text hash is unchanged keeps its vector.** An edit re-embeds
only what changed; a record's passages are matched by position, and any past the
new count are deleted. A new or changed passage is stored with `embedded_at`
null and embedded in the same pass when the call works, otherwise it waits.

## When the index moves

- **A save.** `AppServiceProvider` registers a `saved` listener per kind that
  queues `IndexRecordPassages` after commit; `deleted` forgets the passages. Both
  are guarded — indexing never fails a save, and switched off nothing is queued.
- **What a save misses**, and the nightly run catches: an FAQ or answer block
  saved alone (it is not a kind, so its owner's `saved` does not fire), a
  `saveQuietly()` write, imports, and anything that reached the table without an
  event.
- **`technoware:index-search`** (03:10) starts `IndexSearch`, sliced like the
  Site health sweep: a slice works for 40 seconds and dispatches the next with
  its cursor, then embeds whatever still waits, prunes query vectors older than 30
  days and marks the search file stale.
- **Switching it on** queues the first index. **Changing the model** marks every
  passage waiting (`Indexer::markAllWaiting()`) and queues the index: vectors of
  two models cannot be compared, and the search file's name carries a hash of the
  model so the old file is never read against the new model's queries. The
  `FirstSearchIndex` upgrade step indexes on update only when it is already on.
- **Re-index now** (the panel) takes `IndexSearch::RUNNING_KEY` with `Cache::add`
  and dispatches the same job. The flag is renewed by every slice and released by
  the last, so a crashed chain lets go when it expires (five minutes). It is
  refused while switched off or while the flag is held.

## The search file

A search reads **one packed file** on the private disk (`SearchFile`,
`search/passages-<hash of the model>.bin`) and never scans the table: per record
the passage id, the subject id, the alias and the vector as float32s. It is
rebuilt when marked stale, at most once a minute (a lock), and when missing;
written to a temporary file and renamed, with a guarded decode, so a search that
races a rebuild or meets a partial file answers `[]` rather than throwing.
Vectors stay packed in the per-process memo and are unpacked one at a time while
scoring.

**Cosine is computed in PHP over every passage — fine to about 20,000
passages.** A catalogue in the hundreds of pages is a few thousand passages and a
few milliseconds. Tens of thousands cost a few hundred milliseconds a search and
want a vector index (pgvector, Meilisearch, a vector extension), which is a
different deployment.

## What `Semantic::match()` refuses

It is the one entry point and answers `[]` — words only — when:

- search by meaning is off, or no OpenRouter key is saved, or nothing is
  embedded yet;
- the phrase is under 3 characters (hyphens and spaces not counted);
- the phrase **looks like a part number** (one word with a letter and a digit):
  an exact SKU is a words job, and an embedding of `CBS350-24T` finds its
  neighbours, which is the opposite of what was asked;
- **the day's cap is reached**: `semantic_search_daily_cap` new phrases a day
  (default 2,000);
- OpenRouter takes **over 1.5 seconds**, or refuses.

Its callers (`SearchController`, `Retriever`) wrap it in `try/catch` too: they are
the last line of "search never breaks", and a database error reading the query
cache sits outside `scored()`'s own guard.

## How `/search` blends

**Every word hit stays where it was.** Meaning-only records — those the word
query did not also match — follow the word hits within a group's five, in score
order, and `total` counts them. So an exact title or SKU is still first, and a
group of five words hits has no room for meaning. Records are intersected with
the published query before they are drawn. **No passage text, score or vector
reaches a visitor**: the response shape is unchanged.

## The assistant

`Retriever` adds up to **four passages** that answer the question by meaning,
inside the existing `---WEBSITE COPY---` fence — retrieved copy is still copy and
never an instruction. Each is checked with `Indexable::isIndexed()` again, its
excerpt is cut to 600 characters, and a page is never offered twice. More
questions are answered from the website, so fewer land on the unanswered list.

**The meaning lookup runs after the 5-minute retrieval cache and never inside
it** (Ruling 6 of the build). The editorial cache is keyed by search terms, so a
second phrasing of a question would be served the first one's meaning, and a
transient embedding failure — `[]` — would be remembered for five minutes. The
query vector has its own 30-day cache and scoring is in memory, so the cost is
one file scoring per question.

## The query cache and the model

`search_query_vectors` holds each normalised phrase's vector under
`sha1(phrase | model)` for 30 days (`last_used_at` is touched at most hourly).
**A change of model never serves the old model's vector.** Only a cache miss
counts against the daily cap and costs a request; the same phrase is free for 30
days. Two first searches of one phrase can race, and the loser's insert is
ignored.

## The floor

`semantic_search_floor` (default **0.35**) is the cosine below which a passage is
noise. It is a setting with a reader (`SemanticSettings::floor()`) and **not
drawn on the form**: it is tuned, not chosen.

**0.35 has not been measured against a real embedding model** — the suite runs on
a faked endpoint. To measure it with a real key:

1. Switch it on, Test the model, Re-index, and wait until the panel shows nothing
   waiting.
2. Pick six to ten questions whose answers you know and a few that nothing on the
   site answers.
3. In `php artisan tinker`, run `App\Support\Search\Semantic::match('your
   question', App\Support\Search\Indexable::aliases(), 20)` for each — score the
   matches you would be happy with, and the nonsense ones.
4. Set the floor just under the weakest good match
   (`Setting::where('key','semantic_search_floor')->update(['value'=>'0.4'])`,
   then `Setting::flushCache()`). A floor too low lets noise through; too high and
   a paraphrase finds nothing, which is the feature's whole point.

Scores differ by model, and the default dimensions (512 for `openai/*`, via the
`dimensions` parameter) change them too — re-tune after changing either.

## What it misses

- A saved FAQ or answer block alone, and `saveQuietly()` writes: the nightly run.
- **A queued-but-not-started index run holds no in-flight flag** — the flag is
  taken when a slice starts running, so two queued runs (the nightly and a
  settings save) can overlap. They are idempotent (hash-diffed), so the cost is
  duplicated embedding calls, not wrong data.
- **With no queue worker**, the console's Re-index refuses again for up to five
  minutes: the flag is taken by the press and only a running slice releases it, so
  a job nothing drains holds it until it expires.
- A gap of over 3.5 minutes between two slices lets the flag lapse mid-chain.
- A new or edited page is found by meaning once its job has run and the search
  file has been rebuilt (at most a minute later); until then it is words-only.
- Unpublishing removes a record's passages at once, but the packed file is
  rebuilt at most once a minute, so a stale id may sit in it for that long; every
  consumer intersects with the published query, so it is never shown.
- `total` counts meaning-only ids from the file before they are checked against
  the published query, so for up to a minute after an unpublish it can count one
  record that is not drawn (nothing is shown or leaked).
- Scoring cost is linear in passages, and `rename()` of the rebuilt file can fail
  on Windows over an open file (caught; the stale flag is already cleared, so the
  next rebuild is the next stale mark).

## What it costs

One small request per **new** search phrase (a few hundred bytes in, a vector
out); the same phrase again is free for 30 days. Indexing sends each changed
passage once: a catalogue of a few hundred pages is a few thousand passages,
roughly a few cents with `openai/text-embedding-3-small`, and a model change
re-embeds everything. The daily cap bounds the search side; the index is bounded
by how much is edited.

## Privacy

**Sent to OpenRouter:** the text of **published** records — titles, summaries,
bodies, FAQs, answer blocks, a product's brand, category and spec sheet — and
the search phrases visitors type (normalised: lower-cased, punctuation removed,
nothing identifying them). The request carries the same attribution headers every
AI call does, and is pinned to the maker's own provider with no fallback.

**Never sent:** drafts, anything unpublished, prices, stock, customers, orders,
tickets, leads, form submissions, staff, settings, or any credential. A visitor's
IP address and session are not part of the call. Free OpenRouter models may keep
prompts for training; an embedding model should be a paid one.

## The console

Settings → Infrastructure, beside the OpenRouter key: the switch, the model, the
daily cap and `SemanticSearchPanel`. `GET /admin/search/semantic` reads the
status (passages total / embedded / waiting, today's phrases against the cap, the
last refusal in OpenRouter's words, the last full index, whether one is running),
`POST …/test` sends one short request and reports the dimensions, `POST
…/reindex` queues the index. All `role:admin`. Both buttons use what is saved.
`semantic_search_error` is written by a refused call and cleared by a good one.
