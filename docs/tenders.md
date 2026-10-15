# Tenders

Notices inviting bids (0.174.0). A reference, a scope of work, the window it
is open for, its documents and how to submit — and that is the whole of it.

The client's four decisions, taken 2026-10-14:

- **A notice board, not a bidding platform.** Vendors read the notice,
  download its documents and bid the way it says: by email, by post, or on
  whichever portal the buyer named. Nothing is submitted through this site.
- **Tender fee, EMD, a pre-bid meeting and a bid opening date** are in. An
  outcome field — awarded to, cancelled — was offered and **not** chosen: a
  closed tender simply reads Closed.
- **The category is a managed list**, the `download_categories` shape.
- **`role:content_manager`** posts and edits.

---

## A closing date is a deadline, and a deadline must never be shown wrong

Everything else here follows from that one sentence. A bidder who reads
"open" on a tender that shut on Tuesday has been told something that costs
them real work — days of it — and it is not a failure anybody would notice in
testing, because a page built this morning is right all morning.

So:

**There is one definition of the window and it is computed, never stored.**
`App\Support\Tenders\TenderWindow` takes a tender and a clock and answers
`upcoming`, `open`, `closing_soon` or `closed`. Three things ask — the public
resource, the state endpoint, the console's badge — and a fourth would be a
fourth answer. There is no `is_open` column to drift from the clock the moment
it was written; `scopeOpen`/`scopeClosed` on the model are its SQL twins, for
a query that cannot build one per row, and `isOpen`/`isClosed` its PHP twins.

**The notice's page is ISR-cached, so its badge is a client island.** The page
renders the state it was built with. `TenderStateChip` re-asks
`/api/tenders/{slug}/state`, which is `no-store` on both sides, once it is on
screen; the server's answer is the starting value, so nothing moves when the
real one arrives and a failed fetch leaves a slightly old answer standing
rather than an error. The events' availability panel is the precedent. It asks
**once, on mount** — a countdown ticking in front of a reader would be
theatre, since the deadline is hours or days away.

**The index page is dynamic, so it needs no island.** It reads `searchParams`
(a category, a search, a window, a page), which is the downloads centre's
shape rather than the events index's, and being rendered per request its
chips are at most a minute old — the API's own cache window. Twenty islands
to shave that minute would be twenty fetches for nothing.

**`revalidate` is 60 seconds, not the events' 120.** A cached response holds
the state the API computed when it was fetched, so the number *is* "how long
a listing may be wrong about a deadline". A minute is the most that may be.

**Calendar days, not blocks of 24 hours.** "3 days left" means the day after
the day after tomorrow. Counting in 24-hour blocks calls a 6pm deadline
tomorrow "0 days" at 7pm today and "1 day" at 5pm today — the same deadline
described two ways within one evening. `TenderWindow` diffs the two dates at
the start of their day in `APP_TIMEZONE`.

**Every label on the wire is the API's.** `opens_label`, `closes_label`,
`state_label`, `closes_in_label`, `fee_label`, `emd_label` —
`App\Support\Tenders\TenderText` writes them all, in `APP_TIMEZONE`. Not one
`toLocaleDateString` in the whole module, on the public side or the console's:
a date formatted in the browser is in the browser's zone, and "six in the
evening on the 10th" has to mean the same thing to a bidder in Kolkata, in
Dubai and on a laptop somebody forgot to set. The only numbers that cross the
wire are the instants, for `<time dateTime=…>` and for sorting.

---

## The reference is the company's own number

`tenders.reference` is a string an editor types — `TW/2026/014` — and it is
**unique**. Not `App\Support\References`'s `PREFIX-YYYY-NNNNN`: a tender
number is often prescribed by the buyer and is quoted on paperwork this
application does not own, so generating one would be inventing an identifier
somebody else has already given. Two notices answering to one number is a
question nobody can resolve, hence the unique index.

**It is searched with its punctuation stripped.** Nobody types the slashes, so
`Tender::scopeSearch` compares the stored reference with its own punctuation
removed as well as literally: `TW/2026/014`, `TW 2026 014`, `tw2026014` and
`2026014` all find it. Three characters is the floor — a two-letter fragment
matches every reference there is. The knowledge base's `scopeSearch` is where
that clause comes from; `%` and `_` match themselves, as in every search here.

**Duplicating does not copy it.** The copy takes `TW/2026/014-copy`, which an
editor replaces with the real number. It is the one field nobody else can
guess for you, and leaving it blank would be a draft that cannot be saved.

---

## The documents are library files, and that is a decision

`tenders.documents` is a JSON list of `{title, file_path, note}` in the
editor's order (a JSON array keeps its order, and the order is content).
`App\Support\Tenders\TenderDocuments` resolves them to `{title, note, url,
size, extension}` in **one** `Media::whereIn` for the whole list — a tender
with ten of them must not be ten queries, and an index drawing twenty tenders
must not be two hundred.

**A document whose media row has gone is dropped from the public read**, never
drawn: a bidder given a button that 404s has been told a document exists when
it does not. The console says the opposite — it shows the row with `missing:
true` and a sentence, because the editor is the only one who can fix it and
hiding it would make the screen simply wrong.

**They are public files, which is why none of the downloads centre is here.**
The whole purpose of publishing a notice is that anybody may bid, so there is
nothing to restrict and no question of who is reading. That buys the module
out of `source`, `private_path`, `DownloadFiles`, a streaming route, a
throttle and a proxy on the website — about six hundred lines, none of which
would be protecting anything.

**What it costs if that changes.** A tender document that must be restricted,
or must not have a guessable address, cannot be one of these: it would mean
moving them to `Download` rows, with a migration. The time to decide that is
before the first tender is published, not after.

Deleting a tender **does not** delete its documents. The library is where a
file is removed, and the same pack is often on two tenders.

---

## A notice nobody can answer does not go up

`submission_email`, `submission_url` and `submission_address` are each
optional, and **publishing with none of the three is a 422** — one sentence,
naming all three ways, so the editor does not have to find out which one was
wanted. It is checked against what the tender *will be* (the `settled()`
pattern), so a `PATCH` clearing the only one is refused too, and the bulk
"Publish" is held to the same rule by the same words.

A draft may be as unfinished as it likes.

The other cross-field rules, each a 422 on the field a person would look at:
`closes_at` after `opens_at`; `opening_at` not before `closes_at` (bids are
opened once they are in); `prebid_at` before `closes_at` and not before
`opens_at`; and `prebid_place` required when `prebid_at` is set — a meeting
with a time and no place is one nobody can attend.

---

## A closed tender stays on the site

It is read-only history: what this company has invited bids for. Taking it
down would break every link to it and lose the only evidence the notice
existed.

So `scopePublished` is about the *status* and not the window — a closed tender
is still published, and the window is a separate question. The archive is
`/tenders?when=closed`, it is in the sitemap (`yearly`, priority 0.4, the
events' treatment of a past event), and a menu item pointing at a closed
tender stays linked. `MenuItemType::url()` takes a tender out of a menu for
**its publish status only**, never for its deadline.

Two places deliberately show only the open ones, because offering a notice
that shut last spring reads as an invitation rather than a record: the page
builder's `tenders` cards source, and the assistant's retrieval.

---

## Money is paise, and blank is not zero

`fee_paise` and `emd_paise` are integers, the store's rule. The console asks
for **rupees** (`fee_rupees`) and converts in the action: asking an editor for
250000 when they mean ₹2,500 is how a tender goes up with a fee a hundred
times too big, and nothing downstream would question it.

**Null and 0 are different answers.** "We have not said what the fee is" is
null and shows nothing; "the document is free" is 0 and reads *Free*. The
validation floor is 0 for exactly that reason. `TenderText::money()` groups
the Indian way — `₹1,50,000`, not `₹150,000` — because `number_format` groups
in threes and a lakh written as "100,000" reads as wrong to the people this is
for.

---

## The category hides its tenders, and deleting one does not

`tender_categories` is the `DownloadCategory` shape: a name, a slug, an order
and `is_active`, with no status, no page and no SEO. **Not `Sluggable`** — see
`ServiceCategory`'s own note: that trait writes a 301 under `urlPrefix()`, and
a category has no address, so the redirect would move a *tender's* URL.

`is_active` takes a whole category off the public side without touching the
tenders in it: the clause lives in `Tender::scopePublished`, which is the
downloads centre's arrangement. Deleting one is `nullOnDelete` — its tenders
are listed unfiled rather than going with it — and `?category=none` on the
console's list is how they are found again.

`GET /tender-categories` sends only the categories holding a published
tender. A filter that can only ever return nothing is worse than an absent
one, because a reader takes an empty result for "they have none of those"
rather than "that filter was never going to match".

---

## The graph is a `WebPage` and claims nothing more

Schema.org has no tender or request-for-quotation type, and Google has no
tender rich result, so there is nothing richer to emit that would be true.

Reaching for `Offer` would be the worst of the options available: it says
somebody is selling something at a price, and a tender is this company asking
others to quote. `validThrough` is not there either — it is an `Offer`
property, and putting the closing date on a type that does not define it is
markup a validator reports rather than reads.

So `StructuredData::tender()` emits a name, a description, the URL,
`datePublished`, `dateModified`, the Organization as publisher and the
category as `about`. Nothing in a graph is guessed.

---

## Deliberately out

Each of these is cheap to add later and none is wanted now.

- **Bids through the site.** The client's decision. A sealed-submission module
  — vendor accounts, a deadline that locks, an audit trail — is a second
  release, not a field.
- **An outcome field** (awarded to / cancelled). Offered and not chosen. Two
  nullable columns and a console panel if it is ever asked for.
- **FAQs, answer blocks and record sections.** A tender is a notice with a
  scope of work, not a laid-out article. Note that sections are two columns in
  the shared migration `2026_10_08_090000_add_sections_to_more_records.php`
  plus the panel — cheap, and easy to miss.
- **A calendar file** for the closing date and the pre-bid meeting. Genuinely
  useful to a bidder; `App\Support\Events\EventIcs` is the template.
- **Reminders and "notify me".** Offered as an option and not chosen.
- **A settings screen.** The module has one number — how near counts as
  closing soon — and it is `Tender::CLOSING_SOON_DAYS`, a constant. A screen
  for it would be chrome.

---

## Where it is registered

Each is one line, and a missed one **fails at runtime, in the browser, not in
CI** — which is why `TenderAdminTest` has the two wiring tests
`EventAdminTest` has. Writing them found a real one: `MenuItemType::url()`
carries a publish check per type, and without a `Tender` branch a menu item
pointing at a draft rendered a link to a 404 on every page the menu is on.

| What | Where |
|---|---|
| Morph map | `AppServiceProvider` (`tender`, `tender_category`) |
| SEO overview | `Admin\SeoController::ENTITIES` |
| Menu item type | `App\Enums\MenuItemType` — the case, the label, the model, the prefix **and `url()`** |
| Site section | `App\Support\SiteSection` and its has-content check |
| Reserved slug | `App\Support\ReservedSlugs` (`tenders`) |
| Public search | `V1\SearchController` — the state and the deadline as the kicker |
| Console palette | `Admin\SearchController`, gated to the role |
| Structured data | `StructuredData::tender()` |
| Share links | `App\Support\PreviewLinks` + `V1\TenderController::present()` |
| Page history | `App\Support\Revisions` (no sections, so no `body_layout`/`blocks`) |
| Builder cards | `SectionRules::CARD_SOURCES` + `SectionPresenter` + `embed-sections.tsx`'s `KIND` |
| Assistant | `App\Support\Chat\Retriever` — open ones only |
| Sitemap, llms.txt | `web/src/app/sitemap.ts`, `web/src/lib/llms.ts` |
| Console sidebar | `nav-items.tsx` — one group, never `exact` |
| Audits | both route lists, plus two `DISCOVER` entries |
| Mock | `mock-api.mjs` — the public four, the admin CRUD, the bulk alternation |

Tests: `TenderTest` (public), `TenderAdminTest` (console and wiring). Probe:
`web/scripts/probes/tenders.mjs`.
