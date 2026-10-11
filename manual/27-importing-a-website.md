# Importing an existing website from its address or a ZIP

*Who can use this: Administrator.*

If your current website is not WordPress — a hand-written site, a Webflow,
Wix or Framer export, a site-builder template, an old static site —
**System → Site import** brings its pages across. Give it the site's web
address, or a ZIP of its files, and it lays each page out as **sections** you
can rearrange in the page builder, with the pictures, menus, search-engine
details and redirects that go with it. (For WordPress and WooCommerce use
chapter 20 instead: it reads the site's own data and brings far more.)

The import reads a page the way a person would, not the way a program that
knows your old site would. It is good at the common shapes — a large heading
over a picture, a row of three cards, a picture beside some words, a row of
numbers, questions and answers, a quotation, a call-to-action band, a map, a
contact form — and it keeps every other word as ordinary text. It will not get
everything right. **Everything arrives as a draft**, so nothing is on your live
site until you have looked at it and published it.

## What comes across

| | |
|---|---|
| **Pages** | Each page becomes a draft page laid out in sections. The site's own header, menu and footer are recognised (they repeat on most pages) and left out of the pages, so they are not repeated down your new site |
| **Pictures and files** | The pictures a page shows, and PDFs and other documents it links to on the same site, are copied into the media library, with their descriptions (alt text) |
| **Search-engine details** | The page title, description, share picture, and "do not index" if the page said so. The old site's own "canonical" address is never copied |
| **Forms** | A contact form becomes a form of its own, placed in the page. Submissions go to your sales address and the leads list |
| **Menus** | The header menu and the footer menu, as menus you can assign yourself (**unassigned**, always) |
| **Links** | Links between pages are pointed at the new addresses |
| **Redirects** | A permanent redirect from each page's old address to its new one, so links from Google and other sites keep working |

What does not come across, and the review says so: scripts and styling (the
page is drawn in your site's own theme, not the old design), the pictures
inside a row of cards (a card keeps its heading, text and link), videos other
than YouTube and MP4 files, maps other than Google's, and anything on a page
the importer could not tell apart from furniture.

## Before you start

- **A web address** must be public. The import reads it like a search engine
  does: politely (about two pages a second at most), staying on that site, and
  obeying the site's `robots.txt` — a page it asks crawlers to avoid is left
  out and listed. A site behind a password cannot be read; use a ZIP.
- **A ZIP** can hold up to 200 MB and 5,000 files: HTML pages, stylesheets,
  pictures, PDFs and fonts. Anything else (scripts, PHP files, archives) is
  ignored and named in the review. Nothing in the ZIP is ever run or shown to
  visitors; it is unpacked into private storage, read, and deleted when you
  finish or discard the import.
- Your site's scheduled tasks must be running (see the installation chapters) —
  the import works in the background.

## Running the import

1. Open **System → Site import**.
2. Choose **A web address** or **A ZIP of its files**.
   - For an address: type the site's home page, say **how many clicks deep**
     to follow links (3 is usual; 0 reads only that page) and the most pages
     to read.
   - For a ZIP: choose the file. It is sent in pieces, so a large one is fine.
3. Tick what to bring across: **Menus** and **Redirects** (pages always come).
4. Press **Read the site** (or **Upload and read**). The site is read in the
   background; you can leave the screen and come back.
5. **Review.** You see what was found (pages read, furniture left out, menus,
   and what was not brought in with the reason and examples), what the import
   would do for every kind of record, and a table of every page — what it
   becomes and how many sections it is made of. Settle the **Choices**:
   - **The home page** — use the imported home page as this site's home page.
     Leave it unticked and your current home page stays. Either way the
     imported page is a draft, and the home page changes only when you publish
     it;
   - **Menus found** — which of the header and footer menus to bring;
   - **Leave out** on any page you do not want.
   After changing a choice, press **Apply choices and recount** — the counts you
   see are always exactly what the import will do.
6. Press **Import N records**. It runs in the background with a progress bar.
   If it is interrupted, **Resume** carries on from where it stopped.
7. When it finishes, open **Pages**, look at each draft in the builder, tidy
   it, and publish it. Check **Media**, **Menus** and **Redirects** too.

**Discard** throws a reviewed import away. A read that is not imported within
three days is discarded automatically.

## Good to know

- **Page addresses.** A page's old address becomes its address here with the
  slashes turned into hyphens: `/services/web-design` becomes
  `/services-web-design`. If your site already uses an address (`/about`,
  `/contact` and `/blog` are built in), the imported page gets the next free
  one (`/about-2`) and **no redirect is made over the address your site
  already serves** — the review says which.
- **Pictures** are copied from wherever they were on the old site, including
  other websites' pictures it showed. A picture that cannot be fetched, or is
  not a type the media library accepts, is named in the review.
- **Importing again.** Run the import again before you switch domains to pick
  up changes; it **updates** what it created rather than copying it, and never
  changes a page's address. A page you have edited here since the first import
  is **left alone** and listed.
- **A page with nothing on it** once the header, menu and footer are taken away
  is skipped and named.
- Only one import can run at a time.
- **Nothing is emailed** to anyone by the import.
- The import is not an exact copy of a design. The point of it is that the
  words, pictures, links and structure are in your site, ready to arrange.
