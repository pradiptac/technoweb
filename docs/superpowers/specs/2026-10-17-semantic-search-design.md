# Semantic search — design

Roadmap 2.0, item B3. Ships as **0.182.0**. Agreed with the client in chat,
2026-10-17.

## What it is for

Visitors and the website assistant find content by what it means, not only by
the words in it. "Network keeps dropping" finds the Wi-Fi troubleshooting
article and the managed-switches solution although neither uses those words.
Exact matches — a part number, a title — still win.

What the client chose:

| Question | Choice |
|---|---|
| Which searches | The public site search (`/search`) **and** the assistant's retrieval (`Chat\Retriever`). The console palette stays word-only |
| Embeddings provider | OpenRouter, with the key every AI feature already uses (`openrouter_api_key`) |
| Ranking | A blend: word hits keep their place, meaning ranks and fills in the rest |
| What is indexed | Passages of about 200–300 words, split at headings |
| Cost control | Query vectors cached 30 days, a daily cap of new phrases, a timeout; past any of them, words only |
| Storage | MySQL plus similarity in PHP — nothing new on the customer's server |

Not in this release: the console palette, a vector database, re-ranking with a
chat model, search analytics.

**The feature is off by default** (`semantic_search_enabled`). Off, nothing is
sent anywhere and both searches behave exactly as they do today. Any failure
on — no key, the cap, a timeout, a refusal — falls back to words for that
search, silently for the visitor.

## What is indexed

`App\Support\Search\Indexable` is the one list. It holds the kinds the site
search or the assistant already reads, **published records only**:
- solutions, services, industries and product categories
- catalogue products and shop products
- knowledge articles, blog posts, case studies and pages
- events, tenders, downloads, custom-content entries and FAQs

For each kind it gives:
- the "published" query, the one each kind's public read already uses — never a second definition
- the title column and the result row the site search draws
- the text to index

### The text

The text is joined into one plain document:
- the title and summary
- the written body, as plain text through `HtmlSanitiser::toText()`
- the text of visible builder sections, the way `Health\Content` walks them
- published answer blocks and FAQs
- for a product, its brand, category and spec sheet

Prices, stock, dates, references and anything private are never included.

### Passages

`App\Support\Search\Passages::split()`:
- splits the document at its headings into passages of about 200–300 words
- cuts a section longer than 400 words at sentence ends
- makes a short record a single passage
- prefixes each passage with the record's title, and its heading when it has one, so "Step 3 …" still knows what it belongs to
- caps each passage at 2,000 characters

## Storage

### `search_passages`

| Column | |
|---|---|
| `id` | |
| `subject_type`, `subject_id` | morph alias + id |
| `position` | the passage's place in the record, from 0 |
| `heading` | nullable string(160) |
| `text` | text, ≤ 2,000 characters |
| `hash` | char(40): sha1 of the text |
| `model` | string(100): the embedding model the vector came from |
| `vector` | binary: little-endian float32s, packed |
| `embedded_at` | nullable timestamp; null = waiting |

Unique `(subject_type, subject_id, position)`; index `(model, embedded_at)`.

### `search_query_vectors`

| Column | |
|---|---|
| `hash` | char(40): sha1 of the normalised phrase plus the model, unique |
| `model` | string(100) |
| `vector` | binary |
| `last_used_at` | timestamp |

Rows unused for 30 days are pruned nightly.

### The search file

Every embedded passage of the current model, as `(id, subject_type,
subject_id, vector)`, is packed into one file on the private disk:
`search/passages-<model hash>.bin`.
- Rebuilt after an indexing job changes anything, debounced to once a minute.
- A search reads that file, memoised per process. It never scans the table.
- `shortcut:` cosine over every passage in PHP is fine to about 20,000 passages (tens of milliseconds); past that it needs a vector index. The docs say so.
- **Corrected 2026-10-18, after the final review.** The figure above was wrong by an order of magnitude. Measured in place (one vector unpacked at a time, 512 dimensions): 4,000 passages score in 0.26 s, 5,000 in 0.31–0.38 s, 20,000 in 1.1–1.2 s and 40 MB. The documented ceiling is about 4,000 passages for under 300 ms. And the file is no longer rebuilt by a search or memoised per process: only queued work builds it, a request reads what exists, and a memory guard skips meaning when the file would not fit (`docs/semantic-search.md`).

## Indexing

- **On save.** `AppServiceProvider` registers `saved` and `deleted` listeners on every `Indexable` class — one loop, as Site health does.
  - A save queues `IndexRecordPassages(alias, id)` after commit. It is guarded, so a save never fails.
  - The job splits the record into passages.
  - Passages whose hash is unchanged keep their vector. New or changed ones get `embedded_at = null`, and passages past the new count are deleted.
  - It then embeds the waiting passages in one batched call (the endpoint takes an array), up to 100 at a time.
  - A record that is no longer published loses all its passages; so does a deleted one.
- **Nightly.** `technoware:index-search` runs at 03:10.
  - It is sliced (40 s a slice, self-chaining) and walks every `Indexable` record the way the save job does, which catches anything written through `saveQuietly` or the query builder (imports).
  - It then embeds any passage still waiting, and prunes the query cache.
- **A model change.** Changing `semantic_search_model` marks every passage waiting (`embedded_at = null`). The nightly run re-embeds them, because vectors from two models cannot be compared. Until then, searches fall back to words for the passages that are not ready.
- **The first fill.** An upgrade step queues the first full index on update. A fresh install's first index is the 03:10 run after the switch is turned on, and switching it on also queues one.
- **Embedding calls** go through OpenRouter's `POST /api/v1/embeddings`, with `model`, `input` (an array) and `dimensions: 512` where the model takes it. They use the same HTTP client, key and attribution headers as `OpenRouterProvider`. A refusal writes `semantic_search_error` in OpenRouter's words (the `mail_error` pattern), a success clears it, and the job retries on the next nightly run.
- **Off.** With the feature off, nothing is indexed and nothing is sent. The tables stay, so switching it on again embeds only what changed.

## Search time

`App\Support\Search\Semantic::match(string $phrase, list<string> $aliases, int $limit): list<array{subject_type, subject_id, score, passage_id}>`
is the one entry point. It returns `[]` (word search only) when any of these hold:
- the feature is off, there is no key, or the model has nothing embedded;
- the phrase is under 3 characters, or looks like a part number: one token of letters and digits with a dash or a digit-letter run (`CBS350-24T`, `RB4011`). Words handle those best, and meaning blurs them;
- today's count of new phrases has reached `semantic_search_daily_cap`;
- the embedding call fails or takes over 1.5 s.

Otherwise the phrase is normalised: lower-cased, with punctuation and spaces collapsed. Its vector is read from `search_query_vectors`, or embedded and stored, which counts one against the cap. Each record's best passage score is kept, and anything under `semantic_search_floor` is dropped.

### The site search

`GET /search`: the word search runs exactly as now. Within each group:
- word hits come first, in their current order (an SKU first, then title matches);
- records that only `Semantic::match` found follow, by score, up to the group's limit of five;
- a record found by both appears once, at its word position.

Each group's `total` counts the meaning-only records too. Nothing new is in the response: rows have the same shape.

### The assistant

`Chat\Retriever::for()`: its word retrieval runs as now. `Semantic::match` adds the best passages over the floor, up to 4, that the word retrieval did not already return. Each is quoted as the passage text itself, not the record's opening excerpt, inside the existing `---WEBSITE COPY---` fence, with the record's title and path.

`grounded` follows from what was retrieved, as now, so a question answered only by meaning is grounded. The 5-minute retrieval cache is unchanged.

## Settings and console

A private `semantic_search` group, administrators only, drawn on Settings → API keys beside the other AI models:

| Key | Default |
|---|---|
| `semantic_search_enabled` | `0` |
| `semantic_search_model` | `openai/text-embedding-3-small` |
| `semantic_search_daily_cap` | `2000` (0–100,000) |
| `semantic_search_floor` | the measured value, 0–1, not drawn on the form |
| `semantic_search_error` | written by the system |

**The model** is checked like the chat models:
- its shape against `OpenRouterModels`'s rule;
- its existence against OpenRouter's live list, filtered to embedding models where the list says so;
- if the list cannot be reached, it is accepted on its shape alone.

| Method | Path | |
|---|---|---|
| `GET` | `/admin/search/semantic` | `role:admin`. `{enabled, model, passages: {total, embedded, waiting}, today: {phrases, cap}, error, last_index_at}` |
| `POST` | `/admin/search/semantic/test` | `role:admin`, throttled 6/min. Embeds one short phrase with the saved key and model: `{model, dimensions}`, or a 422 in OpenRouter's words |
| `POST` | `/admin/search/semantic/reindex` | `role:admin`, throttled 2/min. Queues the full index now. **202** |

The status panel on the API keys tab shows the passages indexed and waiting, today's phrases against the cap, the last error, and Test and Re-index buttons.

## Safety

- **What leaves the server.** Only published text and visitors' search phrases are sent to OpenRouter, and only while the feature is on. Nothing from a draft, ticket, customer, order, lead or console field is ever sent.
- **No cookie and no client script.** The feature adds neither, so the consent banner is unaffected. The manual's privacy paragraph says that search phrases go to OpenRouter while the feature is on.
- **No new data reaches a visitor.** No passage text, score or vector is in any public response. The assistant's answers are worded by the model from fenced copy, as now.
- **Search never breaks.** Every path that could fail falls back to the word search, and the error is recorded for the console.

## Testing

Every test that reaches the embedding endpoint uses `Http::fake()` with `preventStrayRequests()`, and fakes the endpoint with deterministic vectors (a phrase-dependent unit vector), so meaning results are predictable. Tests cover:
- An exact SKU search returns the product first, with meaning on.
- An article whose words do not match but whose fake vector does is found and counted in `total`.
- Words only when the feature is off, there is no key, the cap is reached, the call times out, or the call answers 401 — and the error is recorded.
- A save re-embeds only the changed passage, and the call count proves it.
- Unpublishing or deleting removes the passages.
- A model change marks every passage waiting.
- The assistant's retrieval includes a meaning-only passage and the answer is `grounded`.
- No public response contains passage text beyond the existing row fields.
- The query cache: the same phrase, normalised, embeds once.
- The packed file round-trips.

A probe (`web/scripts/probes/semantic-search.mjs`) searches the seeded site with the feature on. It runs only when an OpenRouter key is configured, and says it was skipped otherwise.

## Docs and release

- `docs/semantic-search.md` (the module note) and its line block in CLAUDE.md.
- An API.md section.
- The mock's settings group and status route.
- `manual/32-semantic-search.md` and its help route.
- `VERSION.md` and `web/src/lib/version.ts` at 0.182.0.
