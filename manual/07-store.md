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
| Shipping | What delivery costs: one flat figure, or zones and weight slabs |
| Stock | What came in and what went out |
| Reports | What sold between two dates, with CSV downloads |
| Settings | Opening the shop, delivery, returns, reminders, payments (administrators) |

## Opening the shop

An administrator does this once.

1. Open **Store → Settings**.
2. On the **Store** tab, set **Store open** to 1. A closed shop still shows
   its products but refuses the basket.
3. Enter the **delivery charge** (in paise — 0 for free delivery; it is charged
   on every order that ships, and **Store → Shipping** can replace it with
   zones and weights), the
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
4. **The invoice.** With Zoho Books connected (see *Invoices from Zoho
   Books* below) it is made by itself and attached to the order. Otherwise
   **upload it** (a PDF) — the site does not generate invoices, your
   accounts system does. Either way the customer can download it from their
   order.
5. **Internal notes** on an order are for staff only and never shown to the
   customer. (The *Notes for the customer* box beside the tracking details is
   the exception: the customer sees that.)
6. Mark it **Completed** when it is delivered.

Each order has a private link that the customer receives by email. Anyone with
that link can see the order, so customers should not forward it.

## Invoices from Zoho Books

Optional. If your accounts are in **Zoho Books**, the site can make each
order's GST invoice there for you and attach the PDF to the order. You need
to be an administrator to set it up.

### Setting it up

1. Go to the **Zoho API Console** (api-console.zoho.in for an Indian
   account) and sign in as a user who can create invoices in Zoho Books.
2. Choose **Add Client → Server-based Applications**. Give it any name, your
   website's address as the homepage, and — as the **Authorized Redirect
   URI** — your site's address followed by
   `/admin/store/settings/zoho/callback` (the Zoho Books tab shows this).
3. Copy the **Client ID** and **Client Secret** it gives you.
4. In the console here, open **Store → Settings → Zoho Books**. Paste the
   client ID and secret, check the **data centre** (India for an account at
   zoho.in), choose **your state**, and press **Save store settings**.
5. Press **Connect Zoho Books** and approve the request on Zoho's page.
6. Back on the tab, choose your **organisation** and save. The two tax lists
   then appear: choose the tax for **sales inside your state** (usually the
   group named GST18, which splits into CGST and SGST) and for **sales to
   other states** (usually IGST18). Save.
7. Under **Payments and refunds**, choose the Zoho **account** each way of
   paying goes into — your bank account for transfers and UPI, a cash account
   for cash on delivery, the clearing account your accountant uses for card
   payments. Leave one on *Not sent to Zoho* to enter those yourself. Save.
8. Press **Test the connection**. Then switch on **Create invoices in Zoho
   Books** and save.

The secret is stored encrypted and is never shown again.

### What happens then

- An invoice is made **when the order is dispatched** — or, for an order
  with nothing to ship (a licence, a service), when it is paid. You can
  choose **When the order is paid** for every order instead.
- The customer is looked up in Zoho Books by email address. If they are
  there, that contact is used as it is; if not, one is created from the
  order.
- The invoice uses the prices the customer paid, GST included, and any
  discount code. CGST and SGST, or IGST, is chosen from where the order is
  delivered.
- It is saved in Zoho Books as **sent**, its number and date appear on the
  order, and its PDF is attached for the customer to download.
- Each order's screen has a **Zoho Books invoice** panel showing where it has
  got to, with **Create the Zoho invoice now** if you want one early or for
  an older order.

### Payments and refunds

- Every payment recorded on an order is recorded against its invoice in Zoho
  Books, into the account you chose, so the invoice shows as paid there. A
  card payment usually arrives before the invoice exists; it is recorded the
  moment the invoice is made.
- Every refund recorded on an order makes a **credit note** against the
  invoice. Refunding the whole order lists the invoice's items; a refund from
  a return lists what came back; any other refund is one line for the
  amount. The money is shown paid back from the same account.
- Under **Payments** on the order, each line says where it stands in Zoho
  Books — *recorded*, a credit note's number, or Zoho's own reason if it was
  refused, with **Try again now**.
- If you have already entered a payment in Zoho Books yourself, the site
  sees that nothing is owed on the invoice and does not record it again.
- To stop sending payments and keep only the invoices, switch off **Record
  payments and refunds in Zoho Books**.
- **Connected Zoho before this version?** The tab shows *Connect Zoho again*:
  press Disconnect, then Connect Zoho Books, and approve. Recording payments
  needs a permission the first connection did not ask for.

### If Zoho refuses an invoice

The site tries again by itself over the next day. After that the store
**Overview** shows *Zoho invoices refused*; open the order to read why, in
Zoho's own words — a customer's GSTIN that Zoho does not accept is the usual
reason. Fix it (in Zoho Books or on the order) and press **Try again now**.

### What it does not do

- **It does not record gateway fees.** The full amount the customer paid is
  recorded; enter your payment provider's charges in Zoho Books.
- **It does not cancel an invoice.** An order cancelled after it was
  invoiced and never paid still has its invoice in Zoho Books; void it there.
- It never makes a second invoice for an order, and it leaves alone any
  order you have already uploaded an invoice to.
- Orders placed before you switched it on are not invoiced automatically.

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

## Returns

Customers can ask to send goods back from their order — from the link in
their order email, or from **Orders** in the customer portal. You decide each
one under **Store → Returns**.

**What a customer can return.** The order must have been dispatched, and the
request must arrive within your return window: the number of days under
**Store → Settings** (*Return window, in days*), counted from the day you marked the
order **Completed**. If you never mark it completed, the window is counted
from dispatch plus your longest delivery time. Licence keys and services
cannot be returned, and neither can a product you have marked as
non-returnable. The customer chooses the items and how many, gives a reason,
and may add up to four photographs.

**Working a return:**

1. **Store → Returns** lists the requests, the ones waiting for you first.
   The store overview also shows how many are waiting. You are emailed when
   one arrives (at your support address).
2. Open it. You see what is coming back, the reason, the customer's words
   and their photographs (each downloads to your computer).
3. **Approve** it, or **decline** it with a reason. The customer is emailed
   either way. An approval email includes your return instructions (see
   below) and any message you type. A decline can be reversed later with
   **Approve it after all**.
4. When the goods arrive, enter how many of each turned up and tick **Put
   back in stock** for the ones fit to sell again, then press **Mark as
   received**. Only ticked items go back into stock; the customer is told
   their return has reached you.
5. Send the money back through your payment gateway or bank, then **record
   the refund** here with the amount and its reference. The amount starts on
   the price of what arrived — change it if you are returning less. The
   customer is emailed, and the refund appears on the order.

**Close without a refund** ends a return some other way — you sent a
replacement, or the customer kept the item. Nobody is emailed. Use this too
for a cash-on-delivery order that was never paid for: there is nothing to
refund.

The customer follows the return on their order page: *Requested*,
*Approved*, *Items received*, *Refunded*.

**Settings** (Store → Settings):

- **Let customers ask for a return online** — on by default. Switched off,
  the order page tells customers to contact you instead.
- **How to send goods back** — plain text added to every approval email: the
  address to send to, or that you will arrange a collection. If it is blank,
  say where to send the goods in your message when you approve.
- **Return window, in days** — it is the same figure your product
  pages and Google listing already show.

Return numbers look like `RMA-2026-00001`. An administrator can change the
prefix under **System → Settings → Reference numbers**.

Things to know:

- Nothing is refunded automatically, and nothing is sent to the gateway.
- A customer can make more than one return from an order, but never for more
  than they bought. After a declined request they may ask again.
- The wording of the five customer emails and the one to your desk is under
  **System → Email templates**.
- Return shipping labels, exchanges and store credit are not part of this:
  for an exchange, close the return and place the replacement order.

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

## Tags

Tags are the small coloured pills under the shop's search bar. A shopper
presses one to see only the products that carry it. The row appears once a
shopper has chosen a category — on a category page, or after picking one in
the search bar — and shows that category's own tags; the shop's front page
has none. A tag is always the same colour, everywhere, so it is easy to recognise.

**On a product.** The product form has a **Tags** field on the Content tab.
Type a tag and press Enter (or a comma) to add it; press × on a pill to remove
it. The shop's existing tags are offered as you type, so "Wi-Fi 6" is not
typed three different ways — and "Wi-Fi 6", "wi-fi 6" and "WIFI 6" are treated
as one tag anyway. A product holds up to 12 tags of up to 32 characters.

**Suggest tags** proposes some to press. When the AI assistant is switched on
(Settings → SEO defaults), has a key and has not used up the day's allowance,
it reads the product and suggests five to eight, reusing the shop's existing
tags where one fits. Otherwise it suggests the product's brand, its category
and its key specifications ("24 Ports"). Nothing is added until you press it.

**Automatically.** A product that has no tags gets some the first time it is
saved or imported — its brand, category, *Digital* for a licence or download,
and the values of the specifications its category offers as filters. This
happens **once**: if you remove those tags, they are never put back. Switch it
off with *Tag new products automatically* on **Store → Tags**.

**Store → Tags** is where they are tidied.

- **The row** — switch the whole row off, set how many tags it shows (4 to 30)
  and switch the automatic tagging on or off.
- **Tag untagged products** applies the automatic rule to every product that
  has none and has never been tagged.
- **The list** — each tag in its colour with how many products carry it.
  **Shown** switches a tag off the shop's row (it stays on its products). The
  arrows put the tags you care about first; the rest follow by how many
  products carry them. **Rename** changes the name (and so the tag's address).
  **Merge into…** moves a tag's products onto another and removes it — the way
  to join two spellings. **Delete** asks first and says how many products
  lose the tag.

**Spreadsheets.** The shop export and import have a `tags` column, with the
tags separated by `;`. A blank cell leaves a product's tags as they are. A
WordPress / WooCommerce import brings each product's tags across.

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

## Product videos

**Store → Product videos** controls the "Shop the videos" row: vertical
videos, each with its product under it (picture, name, code, price and an Add
to basket button) and the video's title beneath.

The videos themselves are the ones on each product's **Media** tab — up to
four, a YouTube link (a Shorts link works) or an MP4/WebM from the library.
Give a tall poster for the best look; without one the tile shows the product's
first picture. The row draws only when a product has a video, so nothing
changes until you add one. The screen tells you how many products have one.

- **Where it shows** — the shop front, a small *Watch* row on each product page
  (that product's own videos first, then other products' unless you switch
  that off), and the homepage. Each place has its own switch. A page builder
  page can also carry it: add a *Product videos* section.
- **How it reads and looks** — the heading, an optional line under it, the
  shape (portrait, square or landscape), how many (4 to 24), the order, and
  whether the product code is shown.
- **Playing** — by default a video shows a picture and a play button and
  nothing is loaded from YouTube until someone presses it; only one plays at a
  time. *Play silently when on screen* starts muted, looping videos by itself
  (at most four at once, with a *Pause videos* button). That contacts YouTube
  without a press, so where the cookie banner is in use it waits until the
  visitor accepts, and it never plays for visitors who asked for less motion
  or are saving data. Pressing a tile plays it with sound.

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

## Shipping: what delivery costs

*Store manager and Administrator.* Open **Store → Shipping**.

**The charge a customer sees is the charge they pay.** It is added to any order
that has something to ship — a basket of licences and downloads has no delivery
— and it appears as a **Delivery** row on the basket, the checkout, the order
page, the order emails, the sales CSV and, if you use Zoho Books, as a line on
the invoice. A discount code never reduces it, and for cash on delivery it
counts toward the maximum order value. If you ever typed a delivery charge in
Store → Settings, it is charged from the first basket after the update; at 0
nothing has changed.

### One flat charge

The default. One figure, on every order that ships; 0 for free delivery.

### By zone and weight

Switch to **By zone and weight** when delivery should cost more for a heavy
basket or a far-off state.

1. **Make the default zone first** — **Add a zone**, tick *This is the default
   zone*, name it "Rest of India". It answers for every state no other zone
   claims, always delivers, and cannot be switched off. "By zone and weight"
   cannot be chosen until it exists and has at least one **weight slab**.
2. **Add the weight slabs**: each is a weight limit in grams and the charge up
   to it. The first slab whose limit is at or above the basket's weight sets
   the charge, so a basket of exactly 1000 g belongs to the "up to 1000 g" slab.
   Above the last slab the charge is that slab's plus the amount you give **per
   extra kilogram** for every kilogram started. Type 0 if there is no extra.
3. **Add other zones** — "East", "Metro cities" — by ticking their states. A
   state can be in only one switched-on zone; the dialog shows whose it is. Give
   a zone **free delivery from** a basket value if you like: it is judged on the
   goods *after* any discount code.
4. A zone can be one you **do not deliver to**. A customer whose address is
   there is told so at the checkout and cannot place the order.

Order the zones with the arrows. Deleting a zone does not change an order
already placed: each order keeps the figure it was charged and the zone's name
as it was.

### Weights

A basket weighs the total of its physical lines: quantity × the option's weight,
or the product's, or the **default weight** you set on this screen (500 g) for a
product with none. The screen counts the shop products that have no weight;
**Show them** opens the product list filtered to those. Enter a weight (in
grams) on the product's Shopping tab, and per option in the variations
editor — leave an option's blank to use the product's.

### At the checkout

When delivery is charged by zone, **State** is a list. The PIN code still
fills it. The Delivery row reads "Worked out at checkout" until a state is
chosen and then shows the figure; the total includes it. If the address is
changed after the figure was shown, the order is refused once with the new
total, so nobody pays an amount they did not see.

### Google Merchant Center

With delivery charged by zone, the product feed (`/store/feed.xml`) and the
product pages' structured data **state no delivery price** — it depends on where
the parcel goes, and a single figure would not match what the checkout
charges. Set your shipping rules **in Merchant Center itself** (Shipping and
returns → Shipping), using the same zones and rates. With a flat charge the
feed carries it as before.

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
- Invoices are uploaded — or made in Zoho Books if you connect it. Payments
  and credit notes are still entered in Zoho Books by hand.
- The shop's products and the catalogue's products are separate lists.
- Place a real test order through the gateway, with test keys, before going
  live — and switch to live keys afterwards.
- The seeded `/returns` and `/shipping` pages are placeholder text; have them
  written properly before launch.
