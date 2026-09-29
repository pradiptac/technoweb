# Importing an existing WordPress or WooCommerce site

*Who can use this: Administrator.*

If your current website runs on WordPress — with or without a WooCommerce
shop — **System → WordPress import** brings its content, shop, customers and
orders across into your new site. It reads the old site over the internet;
you do not need to export files or give anybody database access.

The import cannot be perfect, because the two systems are built differently.
What it promises is to be **complete and accountable**: everything that has a
place here arrives exactly, and everything that does not is **listed, with the
reason and examples, before anything is written**.

## What comes across

| Section | Includes |
|---|---|
| **Content** | Posts (a sticky post arrives as **Featured**), pages, blog categories, comments, menus, SEO titles and descriptions (Yoast or Rank Math), and the pictures they use |
| **Shop catalogue** | WooCommerce products and their variations, categories, brands, stock and reviews |
| **Customers and orders** | Customer accounts with addresses, coupons, and every order with its payments, refunds and notes |
| **Custom fields and post types** | ACF field values as custom fields, and custom post types as content types |

Plus: links inside imported text are rewritten to the new addresses, and a
**redirect** is created from every old address to its new one, so links from
Google and other sites keep working.

Some things do not come across, and the review names them. The main ones:

- tags on posts and products; nested categories (they become one level);
- grouped, external, downloadable, subscription, bundle and booking products;
- some coupon restrictions (per-product, per-category, free shipping);
- ACF repeaters, groups, galleries and relationship fields;
- WordPress passwords — customers sign in with an emailed code instead;
- staff and author accounts — authors are matched to existing staff by email
  address, or left blank;
- orders in a currency other than rupees (a shop not selling in INR imports no
  products, coupons or orders).

## Before you start, on the WordPress site

1. **Create an application password** for an administrator: *Users → Profile →
   Application Passwords* (WordPress 5.6 or later). It lets the import see
   drafts, private pages, authors and menus, and also reads the shop if the
   user is an administrator or shop manager. The site must use **https**.
2. **Optionally**, create a WooCommerce REST key with *Read* access
   (*WooCommerce → Settings → Advanced → REST API*) and use that for the shop
   instead.
3. **If you use Yoast**, run *SEO → Tools → Optimise SEO data* first. Without
   it, Yoast reports the same title for every page, and the import will leave
   Yoast's data out rather than copy the wrong one.
4. **If you use ACF**, switch on *Show in REST API* in each field group, or
   the values cannot be read.

Your site's scheduled tasks must be running (see the installation chapters) —
the import works in the background.

## Running the import

1. Open **System → WordPress import**.
2. Enter **The site's address**, the **WordPress username** and the
   **Application password**, and optionally the WooCommerce **Consumer key
   (optional)** and **Consumer secret**.
3. Tick **What to bring across**.
4. Press **Read the site**. The site is read in the background; you can leave
   the screen and come back. Your credentials are used for this read only and
   are never stored.
5. **Review.** You see, for every kind of record, how many will be created,
   updated or skipped — and why each skipped one is skipped, with examples.
   Settle the **Choices**:
   - **Pictures and files** — *Only what the imported content shows* (the
     usual choice) or the whole media library;
   - **WooCommerce added tax on top of its prices** — *Keep the numbers* or
     *Add GST to every price*. Prices on this site include GST, so if your old
     shop showed prices before tax, choose to add it. Past order totals never
     change either way;
   - **Custom post types** — the web address each becomes;
   - for ACF fields, what kind of field each becomes (or skip it).
   After changing a choice, press **Apply choices and recount** — the counts
   you see are always exactly what the import will do.
6. Press **Import N records**. It runs in the background with a progress bar.
   If it is interrupted, **Resume** carries on from where it stopped.
7. When it finishes, check the Blog, Pages, Products, Orders and Redirects.

**Discard** throws a reviewed import away. A read that is not imported within
three days is discarded automatically, because it contains customers'
addresses and orders.

## What the import does not do

- **It sends nothing.** No order confirmations, no welcome emails, no messages,
  no webhooks, no review requests for past orders.
- **It does not touch stock through sales.** Imported orders are history, not
  new sales. Stock levels are taken from WooCommerce as they stand.
- Imported orders are numbered **WC-** followed by the old order number, so
  they never clash with new orders. The **Order number prefix** (System →
  Settings → Reference numbers) applies to new orders only and does not
  change these.
- **Menus arrive unassigned.** Assign them under **Site → Menus** when you are
  ready (chapter 05).
- Imported customers are **active but unconfirmed**. They sign in with an
  emailed code, which confirms them and joins their past orders to their
  account.

**One thing that does happen:** imported customers join the newsletter's
**Existing customers** group automatically. If any running **sequence** is
triggered by that group, the review warns you that those customers would be
emailed — pause the sequence first if you do not want that (chapter 11).

## Importing again before you switch over

You can run the import again as often as you like before you move your domain
to the new site. A second run **updates** what the first one created rather
than making copies, so the usual approach is:

1. Import once, early, and check everything.
2. Keep working on the new site.
3. Just before switching the domain over, import again to pick up posts,
   orders and customers added in the meantime.

A slug is never changed on a second run, so any address you have edited on the
new site stays as you set it.

## Things to know

- Read the review's skipped list carefully — it is the list of what you must
  recreate by hand.
- Choose the tax setting deliberately if the old shop showed prices before
  GST.
- Pause any newsletter sequence that would email imported customers.
- Nothing is emailed to anybody by the import itself.
- Old addresses are redirected automatically, including WordPress's
  `?p=123` style addresses, but not where the old address is one your new
  site already uses.
- Only one import can run at a time.
