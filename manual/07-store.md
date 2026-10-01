# The shop

*Who can use this: Store manager and Administrator. Store → Settings (payments, delivery, reminders): Administrator only.*

The shop is the part of your website that **sells**: products with prices, a
basket, a checkout, payment, stock, discount codes and digital licence codes.
It has its own product list, separate from the advertising catalogue in
chapter 06 — a product can be in either or both, and editing one never touches
the other.

Everything is under **Store** in the sidebar:

| Screen | What it is for |
|---|---|
| Overview | The shop at a glance, and what is waiting on somebody |
| Orders | Every order, its payment, dispatch and invoice |
| Products | What you sell, with prices, stock, variations and codes |
| Categories | The shop's categories and their filters |
| Discount codes | Coupons |
| Reviews | Customer reviews waiting to be approved |
| Promo banners | The promotion band and two tiles on the shop's front page |
| Stock | What came in and what went out |
| Reports | What sold between two dates, with CSV downloads |
| Settings | Opening the shop, delivery, returns, reminders, payments (administrators) |

## Opening the shop

An administrator does this once.

1. Open **Store → Settings**.
2. On the **Store** tab, set **Store open** to 1. A closed shop still shows
   its products but refuses the basket.
3. Enter the **delivery charge** (in paise — 0 for free delivery), the
   **handling time**, the **delivery time** from and to (working days), the
   **delivery service name** and the **return window**. These same figures are
   shown on every product page, on the shipping page and in the Google
   shopping feed, so they always agree.
4. On the **Payments** tab, set up at least one way to pay (below).
5. Save.

All money in the console is entered and shown in rupees, except the few
settings that say *in paise* (100 paise = ₹1). Prices **include GST**; the GST
share is worked out from the price, never added on top.

## Ways to pay

There are four, and the checkout offers only the ones that are switched on
and have what they need.

| Method | Settles by itself? | What the customer sees |
|---|---|---|
| **Card, netbanking or wallet** (payment gateway) | Yes | A secure payment page |
| **Cash on delivery** | No | "Pay the courier when it arrives" |
| **Bank transfer** (NEFT / IMPS / RTGS) | No | Your account details, after ordering |
| **UPI** | No | Your UPI ID and QR code, after ordering |

### The payment gateway

Razorpay and Cashfree are supported (Paytm is listed but not yet available).
You need a merchant account with one of them.

1. In your gateway's dashboard, create API keys (test keys first).
2. In **Store → Settings → Payments**, choose the gateway and paste the keys:
   - **Razorpay:** *Key ID*, *Key secret*, and a *Webhook secret* you make
     up;
   - **Cashfree:** *App ID*, *Secret key*, and the *Environment* (Sandbox for
     test keys, Production for live ones).
3. The screen shows a **webhook address** and the events to tick. In the
   gateway's dashboard, add a webhook with that address and those events (for
   Razorpay, also enter the same webhook secret you typed here).
4. Save, then place a test order.

The webhook matters: it is how the gateway tells your site that money arrived
even when the customer closed the browser before coming back. Without it,
some paid orders will stay "Pending payment".

### Cash on delivery, bank transfer and UPI

Switch each on in the same Payments tab:

- **Cash on delivery** — optionally with a **maximum order value**. It is
  never offered for a basket holding a licence or a download.
- **Bank transfer** — enter your account details. The customer sees them on
  the order page and in their order email; they are never shown at the
  checkout.
- **UPI** — enter your UPI ID, pick your QR code picture from the media
  library, or both. UPI is offered once either is there.

## Nothing marks an order paid except a recorded payment

This is the most important rule in the shop. There is no "Paid" in the status
dropdown. An order becomes paid in exactly two ways:

- the **gateway** reports a successful payment; or
- a person **records a payment** on the order: **Store → Orders**, open the
  order, and in the **Record the payment** panel enter the amount received, a
  reference (the UTR, UPI transaction ID or courier's receipt number) and,
  optionally, when it arrived, then press **Record payment**. Your name is
  recorded against it.

Recording is refused for gateway orders — the gateway decides those. A
payment short of the total is recorded and flagged, not refused. Recording a
payment does not change where the parcel is: a cash-on-delivery order that is
already *Dispatched* stays dispatched and simply becomes paid.

A cash-on-delivery order is born **Confirmed, unpaid**: it is to be packed and
sent, but it is not revenue until the cash is banked and recorded.

## Orders

**Store → Orders** lists every order. Filter by status, open orders or
unpaid ones, or search by order number, name, email or tracking number.

Order numbers look like `ORD-2026-00001`. An administrator can change the
prefix under **System → Settings → Reference numbers** (*Order number
prefix*); only new orders take the new prefix.

The statuses are: *Pending payment*, *Confirmed, unpaid* (cash on delivery),
*Paid*, *Processing*, *Ready for dispatch*, *Dispatched*, *Completed*,
*Cancelled*, *Refund requested* and *Refunded*. The status dropdown on an
order only offers the moves that are allowed from where it is — an order
waiting for payment can only be cancelled.

Working an order:

1. Open it. The screen shows the lines, the addresses, the customer's note,
   the payment and the history.
2. Move it through **Processing** and **Ready for dispatch** as you pack it.
3. Enter the **courier, tracking number and tracking link**. The customer is
   emailed when you change the status to **Dispatched** — not when you type
   the tracking number, so enter it first.
4. **Upload the invoice** (a PDF). Invoices are not generated by the site —
   your accounts system produces them. The customer can download it from their
   order.
5. **Internal notes** on an order are for staff only and never shown to the
   customer. (The *Notes for the customer* box beside the tracking details is
   the exception: the customer sees that.)
6. Mark it **Completed** when it is delivered.

Each order has a private link that the customer receives by email. Anyone with
that link can see the order, so customers should not forward it.

## Refunds

Money going back is recorded the same way as money coming in: open the order
and use **Record a refund** with the amount returned and a reference, then
press **Record refund**. Several partial
refunds add up; the one that completes what was paid moves the order to
*Refunded*.

- **Nothing is sent to the gateway.** Make the refund in the gateway's
  dashboard (or your bank) first, then record it here.
- Refunds are reported **beside** revenue, never subtracted from it, so the
  figures match your gateway's reports.

## Products

**Store → Products** holds what you sell. There are three types:

- **Physical** — shipped; stock is counted.
- **Digital** — delivered as an activation code from your code inventory.
- **Service** — work somebody does; nothing to ship and no code.

To add a product:

1. Press **New product**. On *Content*, enter the name, type, description,
   specifications, features and warranty.
2. On *Selling*, enter the price and, if it is on offer, the **compare-at**
   price (the struck-through "was" price — shown only when it is higher than
   the price).
3. On *Media*, add pictures (the first is the main one) and any **videos** —
   up to four, either YouTube links or MP4/WebM files from the media library,
   each with an optional poster picture.
4. For Google: choose the **brand** on *Content*, and on *Shopping* fill in
   **GTIN** (barcode), **Manufacturer part number**, **condition** and, if you
   know it, the Google product category.
5. Add FAQs on *AEO*. Set the stock (below), choose a category, publish and
   save.

### Variations

A product sold in several versions — 24-port and 48-port, say — has
**variations**, each with its own options, price, SKU and stock. A customer
must choose a variation before adding to the basket. Stock is counted per
variation; the product's own stock box is ignored once it has variations.

### Stock and back-orders

- Set **Count stock** to *Yes* and type the level. The level you type is what is on
  the shelf; the difference from before is recorded in the stock ledger.
- **Allow overselling** (the *Back-orders* choice on the product, or a tick
  on each variation) lets people keep ordering when the shelf is empty. Stock
  then goes below zero, which is the honest record that you owe that many.
- **Cancelling an order or refunding it does not put stock back.** Adjust the
  level by hand if the goods returned to the shelf.
- A **digital product with no codes left** still looks available. The Overview
  warns you under "selling with no codes left"; keep the inventory topped up.

### Digital codes

Open a digital product and follow the **Activation codes** link on its
*Selling* tab. Paste licence keys into **Add codes**, one per line, and press
**Add to inventory**. They are stored encrypted. The list never shows the keys
themselves; press **Reveal** on one if you need it (each reveal is recorded).

- With **Issue activation codes automatically** on (Store → Settings), a code
  is handed over the moment payment lands. Off, press **Issue the codes** on the order.
- The customer is emailed the **activation procedure** (steps and an optional
  PDF), but never the key itself — they reveal it on their order page. Set a
  default procedure in Store → Settings, and override it on a product's
  *Activation* tab.
- If codes run out, the payment still succeeds and the order is counted
  under "paid, waiting for a code" on the Overview until you add more and
  press **Issue the codes** on it.
- An unsold code can be removed; a delivered one cannot.

### Importing and exporting products

On **Store → Products**, **Export the catalogue (CSV)** downloads the whole
shop as a spreadsheet: one row per product and one per variation. **Import**
takes a CSV or Excel file:

1. Upload the file. The console guesses which column is which; correct any it
   got wrong.
2. Review the **dry run**: how many rows will update, create or be refused,
   and why. Nothing is written yet.
3. Commit.

Rows are matched by **SKU**. A known product SKU updates that product, a known
variation SKU updates that variation, and an unknown SKU creates a new
product (as a draft). New variations are never created by import. A blank
cell leaves that field alone. Stock changes are recorded in the ledger with
the import's name.

## Categories and filters

**Store → Categories** holds the shop's own categories (separate from the
catalogue's). Each has a name, picture, description, SEO and a **Filters**
tab.

On **Filters**, pick which specification labels shoppers can filter by in
that category — for example *Ports*, *PoE*, *Form factor*. The list offered is
built from the labels the category's products actually carry, with how many
products carry each. Consistent specification labels across products make
better filters.

Deleting a category keeps its products.

## Discount codes

**Store → Discount codes** creates coupons: a code, a percentage or fixed
amount off (with an optional cap, *Most it can take off*), an optional
minimum order, start and end dates, and limits on total uses and uses per
customer.

- A refused code tells the customer why ("needs an order of ₹50,000 or
  more").
- A code that stops being valid while in someone's basket is removed and the
  customer is told.
- A code's use is counted when the order is placed. If an unpaid order is
  cancelled, that use is given back.
- A code that has been used cannot be deleted — set *Active* to *No* instead, so the
  old orders still explain their totals.

## Reviews

Customers who are signed in can review a product once (writing again edits
their review). **Every review, and every edit, waits** in **Store → Reviews**
until approved. A review from someone who bought and paid for the product is
marked **Verified**.

- **Publish**, **Reject** or mark as **Spam**, one at a time or several
  together.
- **Feature** a review to show it first.
- Star ratings and review counts on the product page, and in Google's
  results, are built from published reviews only.
- To ask buyers for reviews, an administrator switches on **Ask buyers for a
  review** in Store → Settings and sets how many days after delivery. One
  email per order, never twice.

## Promo banners

**Store → Promo banners** edits the shop front's promotion without needing
Settings:

- **Wide band** — a kicker, heading, price line, subheading, a button
  and a product picture on a dark band. Switch on *Show the promo banner*.
- **Two tiles** above it — each with *Show this tile*, a kicker, heading, one
  line, a button and a picture (drawn 2:1; keep the subject on the right, because the words
  sit on the left). A tile shows only when switched on and given a heading or
  a picture. One tile alone takes the whole row.

Button links can be a path on your site (`/store/categories/laptops`) or a
full address.

## Wishlists

Visitors press the heart on a product to save it — guests in their browser,
customers on their account (a guest's list joins their account when they sign
in). The Overview shows the **most wished-for** products.

People who ask for it are emailed, once, when a saved product is **back in
stock**, or when its price drops by at least the percentage set in Store →
Settings (*Wishlist price drop*, 5% by default). These emails go out only
during the promotional hours set under Messaging (chapter 12).

## Back-in-stock requests

An out-of-stock product offers **Email me when this is back**. When stock
arrives, everyone waiting is emailed once. **Store → Products** can be
filtered to products with people waiting, and the Overview counts them.

## Abandoned-basket reminders

Off by default. An administrator switches on **Send basket reminders** in
Store → Settings → Basket reminders. Then somebody who typed an email address
at the checkout (or is signed in) and left without ordering gets:

- a first reminder after the number of **hours** you set; and
- optionally a second after the number of **days** you set, which can carry a
  **discount code** — offered only if the basket could actually use it.

Reminders go out only during the promotional hours set under Messaging, never
to an address that has unsubscribed, and each carries an unsubscribe link.
The Overview shows how many reminded baskets became orders. The wording of the
emails is under **System → Email templates**.

## Feeds for Google and Meta

**Store → Products** shows your feed addresses, each with a copy button:

- **Google Merchant Center** — paste the Google feed address into Merchant
  Center as a scheduled fetch.
- **Meta (Facebook, Instagram, WhatsApp Business)** — in Commerce Manager, go
  to *Data sources → Data feed → Scheduled feed* and paste the Meta feed
  address (XML or CSV). WhatsApp Business uses the same catalogue. An
  administrator can switch the Meta feed off in Store → Settings.

What goes in the feeds:

- Each product (or each variation) with its price, sale price, availability,
  condition, brand, GTIN/MPN, delivery and returns — the same figures as the
  site.
- A product is left out if you set **In the shopping feed** to *No*, if it is a
  service, or if it has **no photograph** (Google refuses SVG drawings, which
  is what the placeholder images are). Those with a problem carry a *Not in
  feed* badge on the product list.
- No stock count is ever published — only in stock, out of stock or
  back-order.

## Overview, Stock and Reports

- **Overview** shows sales for the last 7, 30 or 90 days and, more usefully,
  **what is waiting**: orders to dispatch, paid orders short of a code, products
  out of stock, digital products with no codes, reviews to moderate, people
  waiting for stock. Every figure opens the list behind it. With Google
  Analytics connected (chapter 13) it also shows product views against orders.
- **Stock** lists every movement in and out — sales, adjustments, opening
  stock — for any range, with a CSV download.
- **Reports** shows what sold between two dates (up to a year), by day, week
  or month and by product, with GST and refunds shown separately. The CSV
  downloads use plain numbers so they add up in Excel.

## Things to know

- Nothing marks an order paid except the gateway or a **recorded payment**
  with a reference.
- The dispatch email goes when the status changes to Dispatched — enter the
  tracking details before you change it.
- Refunds are recorded here but made in the gateway or bank.
- Cancelling or refunding does not return stock to the shelf.
- A digital product can sell with no codes left; watch the Overview.
- Invoices are uploaded, not generated.
- The shop's products and the catalogue's products are separate lists.
- Place a real test order through the gateway, with test keys, before going
  live — and switch to live keys afterwards.
- The seeded `/returns` and `/shipping` pages are placeholder text; have them
  written properly before launch.
