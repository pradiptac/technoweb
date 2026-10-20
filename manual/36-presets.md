# Newsroom, investors, testimonials and awards

*Who can use this: Content managers and administrators.*

Four kinds of content that most companies need come ready-made. Installing one
gives you the right fields and a page laid out for it, so you can start adding
entries at once.

Go to **Content → Content types**. The four presets are at the top of the
screen, under **Start from a preset**. Press **Install** on the one you want.

If the address it uses is already taken (say you already have a page at
`/awards`), you are asked to choose another.

Once installed, a preset is an ordinary content type. You can rename it, change
its address, switch it off or add more fields to it. Its entries are under
**Content → Custom content**.

## The newsroom

Installing the newsroom makes two kinds of content:

- **Press releases**, at `/newsroom`. Each has a headline, a summary, the body,
  a picture, the **dateline** (the city it is issued from) and, if you have
  one, the release as a PDF. You can name a media contact for one release;
  otherwise the newsroom's own is shown.
- **In the news**, at `/in-the-news`. Each is an article someone else wrote
  about you: its headline, the publication, the link to the article, the
  publication's logo and the date. These have no page of their own; the card
  links to the article.

The newsroom page shows the newest release first, then the others by year,
then the latest coverage and a **media kit**.

Fill in the media kit on the press releases' content type (**Content → Content
types → Press releases**), in the **Newsroom** panel below the form:

- **About the company**: the paragraph at the end of every release.
- **Press contact**: a name, an email address and a telephone number.
- **Media kit files**: a category from the downloads centre. Put your logos
  and photographs in that category and they are listed in the media kit.

The newsroom has an RSS feed at `/newsroom/feed.xml` for journalists who
follow you.

## Investors

Investor documents are at `/investors`. Each has a name, a **document type**
(financial results, annual report, shareholding pattern and the rest — you
can rename these or add your own), the **financial year** written like
`2025-26`, the file, and the date of the document.

The page groups the documents by financial year, newest first. Visitors can
pick one kind of document with the buttons above the list.

### The email alert

Visitors can ask to be emailed when you publish a document. They join a list
called **Investor updates**, which you will find under **Campaign → Groups**.

On each document:

- Switch on **Email subscribers when published**, and the email goes out by
  itself once the document is live. A document dated for later is sent on
  that day.
- Or, on a document already published, press **Send alert now**.

Each document is announced once, however often either is pressed. If the
email cannot go — usually because the postal address is missing from
**Settings** — the document says why. Fix it and save the document, and it is
sent on the next run, within ten minutes.

The investor contact and the line above the signup are in the **Investors
page** panel on the content type.

## Testimonials

Testimonials are at `/testimonials`, as quote cards. Each has the person's
name, the quote, their role and company, their photo and their company's
logo. Switch on **Featured** for the ones you want on the homepage.

To show them elsewhere:

- **On the homepage**: in **Site → Settings → Homepage**, set **Which quote**
  to **The newest featured testimonial**. While none is featured, the quote
  typed there stays.
- **On any page**: add a **Testimonials** section and set **Which quotes** to
  **From Testimonials**.

## Awards

Awards are at `/awards`, grouped by year. Each has the award's name, who gave
it, the year, a category and the badge. The awards page and the certifications
page link to each other.

## Putting them on other pages

The **From a preset** section shows the newest entries from the newsroom, the
coverage, the investors page or the awards on any page, with a link to all of
them. For investors, you can show just one kind of document.

## Fields you cannot change

The fields a preset's page reads are marked **Used by the preset's layout** on
**Content → Custom fields**. You can change their labels and help text, but
not their keys or types, and you cannot remove them. Add new fields beside
them freely.
