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
A record that is not published has its passages removed when its queued
`IndexRecordPassages` runs (a delete removes them at once).

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

**A passage embedded under another model waits too** (`Indexer::waiting()`: no
`embedded_at`, or a `model` that is not the current one). A slice that was
running when the model changed stamps its rows with the old model; counted as
embedded they would be skipped for good, missing from the new model's file while
the panel said nothing waited. The status count and `embedWaiting()` use the same
rule; the file takes only the current model's rows.

## When the index moves

- **A save.** `AppServiceProvider` registers a `saved` listener per kind that
  queues `IndexRecordPassages` after commit; `deleted` forgets the passages. Both
  are guarded — indexing never fails a save, and switched off nothing is queued.
- **An FAQ or an answer block** edited or deleted on its own screen: `Faq` and
  `AnswerBlock` carry `saved` and `deleted` listeners that queue the owner's
  `IndexRecordPassages` when the owner is an indexed kind, guarded and after
  commit the same way. Otherwise the assistant could quote a removed answer until
  the nightly run.
- **What a save misses**, and the nightly run catches: a `saveQuietly()` write, a
  relation's mass `delete()` (an entity form replacing its FAQs — its own save
  queues the index anyway), imports, and anything that reached the table without
  an event.
- **`technoware:index-search`** (03:10) starts `IndexSearch`, sliced like the
  Site health sweep: a slice works for 40 seconds and dispatches the next with
  its cursor, then embeds whatever still waits, prunes query vectors older than 30
  days and queues a rebuild of the search file.
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
the passage id, the subject id, the alias and the vector as float32s.

**Only queued work builds it** (Ruling 8 of the build). `SearchFile::markStale()`
queues `RebuildSearchFile` after commit — `ShouldBeUniqueUntilProcessing`, so one
waits at a time and a change made while one is building queues the next (a lost
lock lapses after ten minutes). It is called by every embedding batch, by
`forget()`, by `markAllWaiting()`, at the end of the nightly run and the
re-index, and by an index that changed something it could not embed — an edit
that only deleted a passage, or a changed passage whose call failed, which would
otherwise leave the old vector in the file. **A visitor's request never builds
it**: `load()` reads whatever file exists, stale or not, and a missing file is
`[]`, words only. A rebuild streams to a temporary file, renames it over the old
one, and deletes the files of every other model.

**A search scores in place.** `SearchFile::records()` walks the bytes and yields
each vector's offset; `Semantic` unpacks one vector at a time
(`unpack('g<n>', $bytes, $offset)`) and keeps only the best `$limit`, pruning as
it goes — the whole index is never decoded into rows, and a partial last record
is dropped. So a search holds the file's bytes and little else.

**The memory guard.** Before reading, `SearchFile::fits()` asks that the file's
size × 3 plus 16 MB fit in `memory_limit` less `memory_get_usage()` (a limit of
-1 is no limit). If it does not, `load()` answers `''`, search by meaning is
skipped and words answer, and a `warning` is logged at most once an hour — the
request never ends in "Allowed memory size exhausted", which no `try/catch` can
stop.

**Cosine is computed in PHP over every passage, and the ceiling is about 4,000
passages.** Measured on 2026-10-18 on the development machine (PHP 8.3 CLI, no
JIT) with a throwaway script mirroring the scoring loop, 512 dimensions:

| Passages | File | Memory while scoring | Time |
|---|---|---|---|
| 4,000 | 7.9 MB | +8 MB | 0.26 s |
| 5,000 | 9.9 MB | +10 MB | 0.31–0.38 s |
| 10,000 | 19.8 MB | +20 MB | 0.60–0.64 s |
| 20,000 | 39.6 MB | +40 MB | 1.09–1.19 s |
| 5,000 at 1,536 dimensions (a non-`openai/` model) | 29.4 MB | +30 MB | 0.86–0.94 s |

Memory is now the file's size (it was about 2.5 times that while the index was
decoded into rows: +99 MB at 20,000). **Time is the limit**: under 300 ms a
search needs about 4,000 passages of 512 dimensions — a catalogue of one or two
thousand pages. Past that every search pays a second or more, and 20,000
passages (40 MB) is skipped outright by the guard under a `memory_limit` of
128M. A bigger site wants a vector index (pgvector, Meilisearch, a vector
extension), which is a different deployment.

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
- OpenRouter takes **over 1.5 seconds**, or refuses — and then, for **60
  seconds** (`Semantic::BACKOFF_KEY`), every phrase not already cached skips the
  call, so an outage costs one wait rather than one per search. Any successful
  embeddings call lifts it. `semantic_search_error` is written only when its text
  changes, so a repeated refusal does not flush the settings cache on every
  search;
- the search file is missing, or too large for the request's memory (above).

Switched off, `Semantic::passages()` runs no query at all, so a chat question
costs nothing extra.

Its callers (`SearchController`, `Retriever`) wrap it in `try/catch` too: they are
the last line of "search never breaks", and a database error reading the query
cache sits outside `scored()`'s own guard.

## How `/search` blends

**Every word hit stays where it was.** Meaning-only records — those the word
query did not also match — follow the word hits within a group's five, in score
order, and `total` counts them. So an exact title or SKU is still first, and a
group of five words hits has no room for meaning. Meaning-only ids are
intersected with the published query **before** they are counted or drawn, so a
record unpublished since the file was built is neither. **No passage text, score or vector
reaches a visitor**: the response shape is unchanged.

## The assistant

`Retriever` adds up to **four passages** that answer the question by meaning,
inside the existing `---WEBSITE COPY---` fence — retrieved copy is still copy and
never an instruction. Each is checked with `Indexable::isIndexed()` again, its
excerpt is cut to 600 characters, and a page is never offered twice. A
download's address is the centre searched for it (`/downloads?q=<title>`,
`Download::publicPath()`), the link the site search gives it. More
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

- `saveQuietly()` writes and a relation's mass `delete()`: the nightly run.
- **A queued-but-not-started index run holds no in-flight flag** — the flag is
  taken when a slice starts running, so two queued runs (the nightly and a
  settings save) can overlap. They are idempotent (hash-diffed), so the cost is
  duplicated embedding calls, not wrong data.
- **With no queue worker**, the console's Re-index refuses again for up to five
  minutes: the flag is taken by the press and only a running slice releases it, so
  a job nothing drains holds it until it expires.
- A gap of over 3.5 minutes between two slices lets the flag lapse mid-chain.
- A new or edited page is found by meaning once its job and the queued rebuild
  have run; until then it is words-only. With no queue worker the file is never
  rebuilt and searches keep the last one (or none).
- A stale id can sit in the file until the rebuild runs; every consumer checks
  it against the published query before showing or counting it.
- Scoring cost is linear in passages (the ceiling above), and `rename()` of the
  rebuilt file can fail on Windows over an open file; the next change queues the
  next rebuild.

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

Settings → Infrastructure, on the "Search by meaning" tab (the key is on the API
keys tab): the switch, the model, the
daily cap and `SemanticSearchPanel`. `GET /admin/search/semantic` reads the
status (passages total / embedded / waiting, today's phrases against the cap, the
last refusal in OpenRouter's words, the last full index, whether one is running),
`POST …/test` sends one short request and reports the dimensions, `POST
…/reindex` queues the index. All `role:admin`. Both buttons use what is saved.
`semantic_search_error` is written by a refused call (only when its text
changes) and cleared by a good one.
