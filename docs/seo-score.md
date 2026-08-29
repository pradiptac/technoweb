# The SEO score

What `/admin/seo` grades every indexable record on, what each check is
worth, and the rules that decide whether a check counts at all.

Implementation: `api/app/Support/SeoScore.php`. Assembled per record by
`App\Http\Controllers\Api\V1\Admin\SeoController`, which supplies the body
columns and the per-entity depth target. Rendered by
`web/src/app/admin/(app)/seo/`.

---

## What it is for

The overview already reported *whether* a record had a problem. The score
answers the next question — which of two hundred records to open first — and
the list of failed checks answers the one after that, which is what to do once
it is open. **A number on its own is not advice**, so every failure travels
with its weight and a sentence saying what to do about it.

Nineteen checks in four groups. The console shows the figure, a band, and
"N to improve" opening the failures ordered by weight.

---

## The checks

### Title & description — 63 points

| Check | Weight | Passes when | Applies when |
|---|---:|---|---|
| `title_present` | **15** | A title resolves | always |
| `description_present` | **12** | A description resolves | always |
| `title_length` | 10 | 30–60 characters | a title exists |
| `description_length` | 10 | 70–160 characters | a description exists |
| `title_unique` | 8 | No other record publishes the same title | a title exists |
| `description_unique` | 8 | No other record publishes the same description | a description exists |

The two `_present` checks are the heaviest in the whole model, and
deliberately: with no title a search engine writes one from the page, and it
will not be the one anybody would have chosen.

The bounds are guidance about where Google truncates, not validation —
`TITLE_MIN/MAX` and `DESCRIPTION_MIN/MAX` are constants on the class, and the
SEO panel's character counters read the same four numbers so the form and the
score cannot disagree.

### Content — 23 points

| Check | Weight | Passes when | Applies when |
|---|---:|---|---|
| `content_depth` | 10 | Word count ≥ the entity's target | the entity has a body column |
| `headings` | 5 | An `<h2>` or `<h3>` is present | there is a body **and** it is already past the depth target |
| `internal_links` | 4 | The body contains an `href="/…"` | the body has any words at all |
| `image_alt` | 4 | Every `<img>` carries non-empty alt text | the body contains at least one image |

`headings` waiting for the depth target is the interesting one: demanding a
subheading on a three-line page is asking for one that says nothing.

Word counting goes through `HtmlSanitiser::toText()`, never `strip_tags` —
the latter runs the end of one block into the start of the next, which both
undercounts words and invents ones like "supportWhen".

### Focus keyword — 20 points

| Check | Weight | Passes when | Applies when |
|---|---:|---|---|
| `keyword_in_title` | 6 | The title contains the phrase | a keyword is set |
| `keyword_set` | 4 | A focus keyword exists | **always** |
| `keyword_in_description` | 4 | The description contains it | a keyword is set |
| `keyword_in_slug` | 3 | The slug contains it, hyphenated | a keyword is set |
| `keyword_in_body` | 3 | The body text contains it | a keyword is set, and there is a body |

**Setting a focus keyword can lower a record's score, and that is correct.**
Naming one trades a 4-point check for 16 points of harder ones. The
alternative is a score that quietly rewards leaving the field empty.

### Technical — 25 points

| Check | Weight | Passes when | Applies when |
|---|---:|---|---|
| `indexable` | 10 | `robots` carries no `noindex` | always |
| `share_image` | 6 | The record has an `og_image` of its own | always |
| `in_sitemap` | 5 | `sitemap_include` is true | always |
| `slug_clean` | 4 | Lowercase, hyphen-separated, ≤ 75 characters | a slug exists |

`indexable` is worth 10 rather than everything, even though it makes the rest
moot — a noindexed page is often noindexed on purpose, and a record that
crashes to zero for an intentional decision is a record nobody can read a
score for.

---

## The arithmetic

```
value = round(100 × earned ÷ applicable)
```

**Not out of 131.** Each check declares whether it *applies* to the record in
front of it before it declares whether it passed, and the divisor is only the
applicable weight.

An industry has no body column and usually no keyword; scoring it against the
full set would park every industry in the fifties with nothing an editor could
do about it, and a score you cannot move is one nobody looks at twice. The
response carries `checked` for this reason — two records compare as grades,
not as counts.

Bands: **≥ 80 good · ≥ 50 fair · below 50 poor.**

### Worked example — the "Accessories" product category

Title 11 characters, description 76, no body copy, no focus keyword, no share
image, in the sitemap, clean slug.

| Applies | Weight | Result |
|---|---:|---|
| `title_present` | 15 | pass |
| `title_length` | 10 | **fail** — 11 chars, under 30 |
| `title_unique` | 8 | pass |
| `description_present` | 12 | pass |
| `description_length` | 10 | pass — 76 is inside 70–160 |
| `description_unique` | 8 | pass |
| `content_depth` | 10 | **fail** — no body content |
| `keyword_set` | 4 | **fail** |
| `indexable` | 10 | pass |
| `in_sitemap` | 5 | pass |
| `slug_clean` | 4 | pass |
| `share_image` | 6 | **fail** |

Seven checks never applied: `headings` and `internal_links` (no body words),
`image_alt` (no images), and the four keyword checks that need a keyword.

Applicable weight **102**, earned **72** → `round(100 × 72 ÷ 102)` = **71**,
band *fair*, `passed: 8`, `checked: 12`. Which is what the endpoint returns.

---

## A failed check is not an issue

Two different questions, and one list cannot answer both.

`with_issues` on the overview means the five conditions this screen has always
meant, carried on each check as its own `issue` flag rather than a constant
naming keys elsewhere:

- `title_present` — no title
- `description_present` — no description
- `description_length` — outside 70–160
- `indexable` — set to noindex
- `title_length` — **only when over the maximum**

A short title is free space unused, not a fault. Counting it as an issue took
the headline from 23 records to 48 out of 54, and a figure that flags nearly
everything has stopped pointing anywhere.

---

## Depth targets, by entity

From `SeoController::ENTITIES`. The targets differ because the pages do: an
article that stops at 200 words is thin, and a product category description
that reaches 200 is somebody padding a taxonomy label.

| Entity | Body columns | Target |
|---|---|---:|
| Pages | `body` | 300 |
| Blog posts | `body` | 300 |
| Knowledge base | `body` | 300 |
| Case studies | `body` | 250 |
| Solutions | `problem_statement`, `overview` | 250 |
| Services | `body` | 250 |
| Landing pages | `intro`, `body` | 250 |
| Industries | `body` | 200 |
| Products | `description` | 150 |
| Product categories | `description` | 80 |

---

## The site score

`meta.site_score` is the **mean of every record's score**, always across the
whole site and never the filtered page — it is a fact about the site rather
than a description of what is on screen. It carries the distribution across
the three bands and `top_issues`.

`top_issues` is ranked by **count × weight**, not by count. A heavy check
failing on ten records is a bigger hole than a light one failing on twenty.
Each entry's `key` is a value for `?check=`, so the headline figure and the
records behind it are the same query — which is what makes the number
something you can open rather than something you can only read.

---

## The API

```
GET  /admin/seo                    # every indexable record, scored and paginated
GET  /admin/seo/{type}/{id}        # one record, re-scored — the Recheck button
PATCH /admin/seo/sitemap           # the one thing this screen writes
```

Each row carries:

```json
"score": {
  "value": 71,
  "band": "fair",
  "passed": 8,
  "checked": 12,
  "failed": [{ "key": "…", "group": "…", "label": "…", "weight": 10, "hint": "…" }],
  "issues": ["…"]
}
```

**Both endpoints collect every record**, whatever the filters say. Two checks
are "does another record publish this exact title" and the same for the
description, and a duplicate cannot be seen from inside a filtered subset —
narrow to one type and every cross-type duplicate silently becomes unique. A
record scored in isolation comes back with a score that is **too high**, and a
recheck quietly reporting better news than the list is worse than no recheck
at all.

Filtering therefore happens in PHP after the scoring pass. The ceiling is a
few thousand records; past that the duplicate pass wants a `GROUP BY` over a
stored resolved title rather than a full load.

---

## What it cannot see

**Nothing here fetches the rendered page.** Every check reads what is stored.

That buys two things: it can grade a **draft that has never been published**,
which a crawl cannot, and it puts no uncontrolled network call on an admin
request — a cost this project has already measured once, at 12.5 seconds for a
single unreachable host, and the same reason `email:dns` is banned on public
forms here.

What it costs is real and worth stating plainly. This score says nothing
about:

- rendered Core Web Vitals, or anything about page speed
- broken outbound links, or whether an internal link resolves
- what the frontend does with the data after it arrives
- backlinks, crawl errors, or anything only Search Console knows
- whether the copy is any *good* — every content check here is a proxy for
  length and structure, and a 400-word page of nothing scores exactly like a
  400-word page of something

It sees everything an editor can fix from the CMS, which is who the screen is
for.

---

## Live snapshot — 27 August 2026

Against the seeded catalogue, for calibration rather than as a target:

| | |
|---|---:|
| Records scored | 56 |
| Site score | **71** (fair) |
| Good ≥ 80 | 5 |
| Fair 50–79 | 50 |
| Poor < 50 | 1 |
| With issues | 24 |

Top failures by count × weight:

| Check | Weight | Failing |
|---|---:|---:|
| Thin content | 10 | **56 / 56** |
| Title length | 10 | 31 |
| No focus keyword | 4 | 55 |
| Description length | 10 | 22 |
| No share image | 6 | 31 |
| No internal links | 4 | 45 |

**Thin content failing on every single record is a fact about the content, not
about the check.** Most of this catalogue is seeded placeholder copy — a
category with a one-line description and a product with a spec sheet and two
sentences. It is the same list as the placeholder content in `CLAUDE.md` that
must not ship, seen from a different angle, and it will move as real copy
lands rather than by anything changing here.

The same goes for 55 of 56 having no focus keyword: nobody has been through
the records yet. Worth knowing before reading it as a defect.
