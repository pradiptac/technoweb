# SEO: scores, redirects and the AI assistant

*Who can use this: SEO manager and Administrator. The SEO fields on each record's form: Content manager too. SEO → Settings and System → Settings → API keys: Administrator only.*

Your website looks after most search-engine basics by itself: every page gets
a title, a description, a canonical address, structured data for search
engines, a sitemap and a `robots.txt`, all built from what you have written.
This chapter covers the tools for doing better than the defaults.

The screens are under **SEO** in the sidebar: **Overview**, **Landing pages**
and **Places** (both in chapter 06), **Redirects**, and for administrators
**Settings**.

## The SEO tab on every form

Every page, post, article, product, solution and similar record has an
**SEO** tab. Every field on it is optional — leave a field blank and the site
works it out from the record:

- **Meta title** and **Meta description** — what appears in search results.
  Counters show the length of what will actually be published (marked
  "derived" when it is the automatic one). Aim for 30–60 characters for a
  title and 70–160 for a description.
- **Social title** and **Social description** — only if a shared link should
  read differently from the search result.
- **Focus keyword** and **secondary keywords** — the phrase this page should
  win. Used for scoring, not published.
- **Share image** — the picture shown when the page is shared on social media
  (1200 × 630 works everywhere).
- **Schema type** — a more specific kind of page for search engines (for
  example *BlogPosting* instead of *Article*). Only types that make sense for
  that record are offered.
- **Robots** — *noindex* keeps the page out of search results.
- **Include in sitemap.xml** — untick to leave the page out of the sitemap.
- **Canonical URL** — only if this page duplicates another and should point at it.

Only fill in what you want to override. Copying the automatic values into the
boxes turns them into fixed text that no longer updates when the page changes.

## The Overview and the three scores

**SEO → Overview** lists every indexable record on the site — pages, posts,
articles, case studies, solutions, services, industries, products, categories,
vacancies, shop products and categories, custom content — each with three
scores out of 100:

| Score | Asks | Checks include |
|---|---|---|
| **SEO** | Will search engines show this well? | Title and description present, of the right length and unique; enough content with headings; internal links; alt text on images; the focus keyword used in the title, description, address and text; indexable, in the sitemap, a share image |
| **AEO** (answer engines) | Could Google's answers or an AI assistant quote this? | A definition, three or more questions, key facts, use cases, comparisons or steps where they fit, short direct answers, structured data, internal links |
| **GEO** (generative engines) | Can an AI tell exactly what — and who — it is quoting? | Your company details complete and consistent; the record linked to its brand, category, solutions, services, industries; a supporting article; an author on posts; a certification on file; a "why" or "who it is for" block |

**80 or more is good, 50 or more is fair**, below that poor. A check that
cannot apply to a kind of record (a word count on an industry with no body) is
left out rather than counted against it, so scores are fair across record
types.

On the Overview you can:

- filter by type, by band, by "has issues", or by **one failed check** — the
  cards at the top list the **biggest wins** for each score across the whole
  site; press one to see every record failing it;
- sort by the AEO or GEO score;
- open a record's form to fix it (it opens in a new tab so you keep your place
  in the list), then press **Recheck** on its row to re-score it;
- untick a record's **sitemap** box directly from the list.

Scores read what is stored in the console; they never fetch the live page.

## Answer blocks

Answer engines and AI assistants quote short, direct answers. **Answer
blocks** let you write them deliberately. Most records' forms have an
**AEO** tab holding:

- the record's AEO and GEO scores, with every failed check and what would earn
  it;
- the answer blocks themselves;
- the FAQs, on records that did not have them before.

Each block has a **kind**, which decides the heading it appears under on the
page:

| Kind | Shown under |
|---|---|
| Definition — what is it? | What is it? |
| Who is it for? | Who is it for? |
| Why is it needed? | Why is it needed? |
| Key fact / Feature | Key facts / Key features |
| Use case | Use cases |
| Comparison | Comparisons (as a table) |
| Step | How it works (numbered) |
| Question and answer | Questions people ask (with the FAQs) |

Write the **answer** as one or two plain sentences (600 characters at most) —
the part that could be quoted on its own — and put anything longer in the
optional **detail**. A block can be a draft, which is saved but not shown.

## Redirects

**SEO → Redirects** lists every redirect on the site: from an old address to a
new one.

- Redirects **written by the CMS** appear whenever a slug changes, so old
  links and search rankings survive a rename.
- Redirects **added by hand** are ones you add with **New redirect** — for
  example old addresses from a previous website. Enter **Redirect from** (the
  old path, `/old-page`), **Redirect to** (the new path or full address), and
  the **Type**: usually 301 (permanent), or 302 (temporary).

Each redirect shows how many times it has been used and when last. Switch one
off rather than deleting it if you are unsure.

- A new or changed redirect can take **up to a minute** to start working.
- Common policy addresses (`/refund-policy`, `/terms-and-conditions` and the
  like) are already redirected to your policy pages.

## The AI SEO assistant

An optional assistant that **suggests** titles, descriptions, keywords, FAQs,
answer blocks, internal links and improvements. It never changes anything by
itself: you press **Apply to the form** to copy a suggestion in, and nothing
reaches the site until you **Save**.

### Switching it on

Its suggestions are written by an AI model, which the site reaches through a
service called **OpenRouter**. It needs an OpenRouter account and its API
key, with your own Google or OpenAI key added inside that OpenRouter account.
Chapter 18, "API keys", has the steps.

1. An administrator pastes the key into **System → Settings → API keys**
   (*OpenRouter API key*) and saves. It is one key for every AI feature — the
   website assistant uses it too — and nothing is called until an assistant
   is switched on.
2. On the same tab, the administrator chooses **Model for SEO, alt text and
   page drafts**, saves, then picks it under **Model to test** and presses
   **Test this model**. **The model answered** means it is ready; a refusal
   is shown in OpenRouter's own words and says what is missing.
3. In **SEO → Settings**, set **AI SEO assistant** to 1.
4. The model is *Gemini 2.5 Flash (Google)* unless you changed it in step 2.
   The Google models work with a free Google AI Studio key added at
   OpenRouter; the OpenAI models need an OpenAI key, or paid credit, there. A
   model your account cannot use fails on every request, so test it again
   whenever you change it.
5. Set **AI requests per day** — the ceiling that bounds your bill (100 by
   default; 0 removes it).
6. Describe **what the business does**, **who it sells to** and **where it
   operates**, plus any **tone and positioning** notes. Do not list your
   services or places here — the assistant reads those from the catalogue
   every time.

**On a free Google key**, Google limits how many requests it takes each
minute and each day. When a limit is reached an action answers *The AI
service did not answer. Try again shortly.* — wait a minute and press it
again; a request that got no answer is not counted against your daily
ceiling. A bulk run (below) is the quickest way to reach the limit, and it
shares that allowance with the website assistant, which answers visitors
with links instead of written answers while the limit lasts. Run large
batches at a quiet time, or use a paid key.

### Using it

On a record's SEO or AEO tab, choose an action:

| Action | What you get |
|---|---|
| Generate SEO | A title, description and keywords |
| Analyse SEO | Strengths, weaknesses and gaps |
| Improve content | Suggested edits to the text |
| Generate FAQs / Suggest FAQs | Questions the page leaves unanswered, with answers |
| Suggest internal links | Existing pages worth linking to |
| Suggest schema | The best structured-data type |
| Suggest keywords | The phrase to target and those around it |
| Analyse for answers / Analyse for engines | What an assistant could or could not quote |
| Suggest questions | What people ask before choosing |
| Draft answer blocks / Draft product answers | Draft blocks from the page's own material |
| Improve an answer | A tighter version of one saved block |
| Suggest related records | Solutions, services, industries and products to link |

Things the assistant is built not to do:

- **invent facts** — where a fact is missing it writes `[MISSING: …]` for you
  to fill in. Search for that marker before you save;
- link to pages that do not exist — it can only choose from your real pages;
- invent certifications, statistics or customer names.

Every suggestion is kept in the record's history with who asked and what was
decided, so you can go back to one you rejected without paying for it again.

**Bulk runs.** Once you have filtered the Overview, a **Draft with the
assistant** bar offers one action for the records on screen (up to 25 of each
type at a time): choose it and press **Draft for these …**. They run in the
background; then set the **Assistant** filter to **With a suggestion waiting**
to review them one by one. If fewer suggestions arrive than you asked for, the
AI service refused some of them — on a free key, usually its per-minute
limit. Run the action again for the records still without one.

**Alt text.** In the media library's edit dialog, **Suggest alt text** proposes
a description of a picture (chapter 14).

## Google Search Console and Google Analytics

Connecting these adds real figures to the Overview. Both are read-only: nothing
is ever written to your Google accounts.

**Search Console** — clicks, impressions, click-through rate and average
position per page for the last 28 days, and a filter for pages shown in search
twenty or more times but never clicked.

1. In Google Cloud, create a **service account** and download its **JSON key**.
2. In Search Console, add the service account's email address to your property
   as a user.
3. Paste the whole JSON file into **System → Settings → API keys → Search
   Console service account**. Fill in **Search Console property** only if the
   automatic one is wrong (`sc-domain:yourdomain.com` for a domain property).
4. Save and press **Test the Search Console account**.

**Google Analytics 4** — views and users per page for the last 28 days, a
filter for pages search shows that nobody opens, and product views against
orders on the shop's Overview. It uses the same service account:

1. In GA4, add the service account's email to the property as a **Viewer**.
2. Enter the **property ID** (a number, under Admin → Property details — not
   the *G-* measurement ID) in System → Settings → API keys.
3. Save and press **Test the connection**.

A refusal from Google is shown in Google's own words, and the columns are
simply left out until it is fixed.

## SEO settings

**SEO → Settings** (administrators) also holds:

- **SEO defaults** — the description and share image used by any page without
  its own;
- **Published landing pages, at most** — see chapter 06;
- **IndexNow** — tells Bing (and the AI tools that read Bing's index) about
  every new, changed or removed page straight away instead of waiting for a
  crawl. **Switch it on at launch**, not before.

## Things to know

- Leave SEO fields blank unless you mean to override; blank is not "missing".
- A save in the console updates the page at once; a redirect takes up to a
  minute.
- The AI assistant only suggests. Check every suggestion — especially any
  `[MISSING: …]` marker — before you save.
- The daily request limit is what protects your AI bill; keep it set.
- The AI key is an **OpenRouter** key (chapter 18). After saving it, or
  changing the AI model, press **Test this model** on the API keys tab.
- Scores are guidance, not a ranking guarantee. A page that reads well for a
  person matters more than a perfect number.
- Switch IndexNow on only once the site is live on its real address.
