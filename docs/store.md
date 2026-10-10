# The store

A separate catalogue with prices; baskets, checkout, payment, stock, coupons, digital codes, the Merchant Center feed, the catalogue as a spreadsheet, back-in-stock notices, wishlists, specification filters, product video and zoom, the Meta catalogue.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**"Paid" has one definition and three screens read it.** `OrderStatus::isPaid()`
answers for a single case; `paidValues()` is the same rule as a list a query can
use, and `Order::scopePaid()` is that query. Restating it is how the newsletter
ended up with two definitions of "delivered" - one screen reading a column,
another counting rows, one click apart and disagreeing by one.

**"Out of stock" has one definition too, and it is the one the tile links to.**
`StoreProduct::scopeOutOfStock()` is the query half of `inStock()`, so a product
with variations answers for the **set** - a plain `stock <= 0` calls the 48-port
unavailable because the 24-port ran out. The dashboard counts with it and the
products list filters with it, because a tile reading "3 out of stock" that opens
a list of five is worse than a tile that does not link anywhere.

**Overselling is a switch on the shelf, so it lives where the stock does.**
`allow_oversell` on `store_products` *and* on `store_product_variations`,
defaulting to **false** — a default that makes promises to customers is the
wrong one, and false is what the shop did before it existed.
`StoreProduct::allowsOversell(?$variation)` is the one place the rule lives:
**the variation answers for itself when there is one**, the product's flag
applies when there are none. Written out at each call site instead it is five
copies of one sentence, and the drift is silent both ways — a checkout that
refuses what the listing offered, or a listing that offers what the checkout
refuses.

**Switched on, five things have to agree**, and they are the five that read it:
`inStock()`, `scopeOutOfStock()`, `CartItem::availableQuantity()` (null, because
"you cannot have this many" stops being true), `Checkout`'s gate under the row
lock, and `Settlement::takeStock()` — which drops its `stock >= quantity` guard
so the level **goes negative**. That is deliberate: the shop owes that many, and
leaving the guard would decrement nothing while the order was paid, which is a
paid order that moved no stock and the one thing the ledger must never say. A
back-ordered line is not added to the "stock could not be taken" trail either,
or that warning becomes one people learn to ignore.

**A model's in-memory defaults must match its columns.** `is_active` is
`default(true)` in the database and was **null** on a variation that had not
been read back, and `inStock()` opens with `$this->is_active &&` — so a
variation created and asked about in the same breath called itself unsellable.
Nothing in the application does that and a test did, which is the only reason it
was found. Both store models now declare `protected $attributes` for every
boolean with a column default.

**A digital product with no codes left is out of stock silently.** Nothing on the
listing says so, so it goes on selling, takes the money and lands in the queue of
people waiting for something nobody can issue. `attention.codes_exhausted` is the
only figure in the console that names it.

**"Stock in" was recorded nowhere, and a counter cannot be made to remember.**
`stock` is a bare integer that settlement decrements and the admin form
overwrites. The first is derivable from the order lines afterwards; the second
leaves no trace, so a level going from 4 to 40 is indistinguishable from one
that was always 40. `stock_movements` is the ledger, `StockLedger` the only
thing that writes to it, and `StockReport` the read half. Every sale already
made was recovered from orders carrying a `paid_at`.

**`StockLedger::adjusted()` compares, because the form posts a level and not a
change.** "40" in the box means "there are forty", and only the row it replaced
knows whether that is thirty-six arriving or four written off. So the levels are
read *before* the update — a comparison after it has nothing to compare with.

**A product with variations is counted per variation and never on the parent.**
Its own `stock` column is dead — `inStock()` answers from the set, which is why
a 48-port switch is not called unavailable when the 24-port runs out — so a
movement against the parent would put stock into the report that the shop cannot
sell. This is not a corner case: **every real product in this catalogue has
variations**, and the first browser run of the report recorded nothing at all
because the probe edited the parent's field, which looked exactly like a broken
feature. The same trap bit `stock_now` on the read side, where the parent's
column reported 4 for a product holding 13.

**A movement is written on the affected row count, never on having tried.**
`takeStock` already distinguishes "not tracked" from "not enough" that way, and
a row for a decrement that did not happen is a lie about the shelf — which is
what somebody reads to decide what to order. Same rule: a save that did not
change the stock writes nothing, or every description edit fills the ledger with
rows saying nothing happened.

**The report has no opening or closing balance and that is deliberate.** They
are exact for a range after the ledger was added and impossible for one before
it, because the backfilled rows carry no `balance_after`. A column right for
recent months and quietly wrong for older ones is worse than no column: the
figure gets written down either way. Same call as the null average and the null
median.

**`StockLedger` never fails what it is recording.** A throw would fail a
settlement — money that has arrived and cannot be un-taken — or refuse a product
edit that has already been saved. Every write is guarded and logged, the rule
`Notifier` follows for mail and `LeadIntake` for an enquiry.

**There is no `Cancellation` reason because nothing puts stock back.** Cancelling
an order does not restore it and neither does a refund. An enum case for it would
be a promise the code does not keep and a filter that returns nothing for ever;
when restocking is built, `StockMovementReason` is where it starts.

**A dashboard figure is null, never zero, when nothing has been measured.** An
average of nothing is not the same as an average of zero - the rule the ticket
dashboard's medians already follow. And **refunds are reported beside revenue,
never netted off it**: the gateway reports gross and refunds separately, so a
figure matching neither is one somebody has to reverse engineer before they can
trust it.

**The report ranges on `placed_at`, not `created_at`.** They are the same to the
second today and they are not the same fact - one is when the row was written and
the other is when the order was placed. A report is read against dates a person
recognises.

**`diffInDays` returns a float in Carbon 3.** With the end of the range at the
end of its day the obvious expression yields 31.999999 for a calendar month,
which is harmless in a displayed figure and an off-by-one in the guard that uses
the same expression to refuse a range. `SalesReport::spanInDays()` is one helper
for both, so the number shown and the number enforced cannot differ.

**Money in a CSV is a plain decimal, not a formatted amount.** A cell reading
`Rs 1,18,000` is *text* to Excel - it cannot be summed, which is the one thing
anybody opens the file to do. `Money::toRupeeString()` writes `118000.00` and the
column heading carries the unit. `Money::format()` is for email and anywhere else
with no browser.

**There is one CSV writer in the application** and it lives under the newsletter
namespace, where it was first needed. Reuse it: it escapes every cell beginning
`=`, `+`, `-` or `@`, and a second writer here would be a second set of escaping
rules to keep right.

**Four ways to pay, and only one of them settles by itself.**
`App\Enums\PaymentMethod` owns the list the way `MailTransport` owns the mail
transports: gateway, cash on delivery, bank transfer, UPI. Each case carries its
own label, the settings it reads, and the two rules that decide everything
downstream - `settlesOnline()` and `permitsDigital()`.

**"Did we get paid" and "has the order progressed past payment" stopped being
the same question**, and that is the most important consequence of adding cash
on delivery. Until then an order left `pending_payment` only because a signed
callback settled it, so the two coincided exactly. A COD order is packed and
dispatched before any money exists. So `Order::scopePaid()` now reads
**`paid_at`**, and `OrderStatus::isPaid()` keeps the other meaning - may this be
fulfilled. Both are correct about different things, and revenue reads the first.

**`OrderStatus::Confirmed` exists for cash on delivery alone.** A COD order left
at `pending_payment` is indistinguishable in the queue from a basket somebody
walked away from at the payment screen, and one of those is to be packed this
afternoon.

**Cash on delivery cannot carry a licence.** There is nothing to hand over at a
door, and the alternative is issuing a key and hoping. Refused at the checkout by
`permitsDigital()` rather than left to the shop to remember.

**A COD ceiling is a real setting, not a nicety.** Cash on delivery is unsecured
credit and a refused parcel costs the shop both ways. `cod_max_paise`, checked
against the total *this transaction* worked out under a row lock - the same
reasoning as re-validating the coupon rather than trusting the basket.

**Availability is checked only for a method somebody named.** An order that asked
for nothing gets the gateway and is *not* refused when no gateway is configured -
placing the order is worth doing regardless, and the pay step has always been
where a missing gateway is reported. The first cut refused it, which meant a shop
with no keys yet could take no orders at all. What is refused is a method the
shop has switched off: that is a stale tab or a hand-posted body.

**Switched on is not the same as offered.** `isAvailable()` wants the switch
*and* the detail the method cannot work without - a bank transfer with no account
number is instructions nobody can follow, and a UPI option with neither an ID nor
a QR code is the same.

**The sales-order email and the order page read one array, and the email
lists every line.** `OrderPlaced` used to say "nothing has been charged" with a
Pay button to every order — written for the gateway and fired for all four
methods, so a cash-on-delivery customer whose order was born `Confirmed` was
asked to pay, and a bank-transfer customer got no account number by email at
all. `App\Support\Store\OrderMail` builds the item list for both the
confirmation and the receipt (one list, two emails — the newsletter's two
definitions of "delivered" again otherwise), and the payment block from
`PaymentOptions::forOrder()`, which is what the order page renders, so the two
cannot disagree. The QR code is a **link**, not an inline image: mail clients
block remote images by default and the file can be replaced in the library.
`OrderPlacedTest` renders each method and asserts what it must and must not
say — the COD one asserts the *absence* of the Pay link.

**Account numbers never reach the checkout.** `PaymentOptions::forCheckout()`
carries labels and blurbs; `forOrder()` carries the detail, for the method that
order actually used, on a page addressed by a token. It returns null once
`paid_at` is set, because instructions for a payment already made are how
somebody pays twice - and the order page's gateway button is now gated on that
same null, since an order showing both account details and a Pay button offers
two ways to settle one invoice.

**`ManualPayment` is the one path that can make an order paid, and it is not a
dropdown.** `allowedTransitions()` still refuses to reach `paid`. What this adds
is a confirmation that demands an amount, a reference and the name of whoever
entered it - and it refuses a gateway order outright, which is what keeps the
transition rule meaningful. It stamps `paid_at` and **does not touch the
status**: a COD order may be `dispatched` when the cash is banked, and
overwriting that would throw away where the parcel is. A short payment is
recorded and flagged in the trail rather than refused - the money arrived and
cannot be un-taken.

**Nothing in the console can mark an order paid.** That is the difference
between a shop and a way of giving stock away, and it is enforced by
`OrderStatus::allowedTransitions()` rather than by a controller remembering —
`PendingPayment` may only go to `Cancelled`. An order becomes paid because a
payment was verified server-side. `StoreOrderAdminTest` asserts the refusal.

**An order's stamps are set on arrival and never cleared**, the rule
`resolved_at` had to be taught on tickets: completing an order must not erase
when it was dispatched, because everything anybody says about fulfilment speed
reads that column.

**The dispatch notice is sent on the status change, not on the tracking form.**
Tracking is usually typed *before* the status moves — the parcel is labelled,
then handed over — so sending on the form tells somebody their order has shipped
while it sits on a desk.

**The invoice is uploaded, never generated**, and it goes to the private disk
and streams through an authorised route at both ends. It carries a name, an
address and a GSTIN. `invoice_path` never appears in a response: a storage path
in JSON is the first half of making a file fetchable.

**An internal note has no key on the customer's resource at all.** Structural
rather than a flag somebody has to remember — the lesson the ticket module's
internal notes taught, where the worst possible failure is a note in a
customer's inbox.

**A digital code is assigned once, and the constraint that guarantees it is not
the obvious one.** A unique index on `order_item_id` looks right and is wrong:
three licences on one line need three codes, so it enforces "one code per order
line" instead. It was written that way first and failed the moment a test bought
three. The real guarantee is a conditional `UPDATE ... WHERE status =
'available'` with the affected row count checked, inside a transaction holding a
lock on the order line. **A constraint enforcing the wrong invariant is worse
than none: it looks like safety and buys a bug.**

**Codes are encrypted at rest, with a SHA-256 fingerprint beside them.** The
fingerprint exists because encryption takes away the one thing a unique index
was for: ciphertext differs every time, so a duplicate import cannot be
recognised without it. The trade is that rotating `APP_KEY` makes every unsold
code unreadable — the same trade the SMTP password already makes.

**A code on its own is not a delivered product, so an activation procedure
goes with it.** Rich text plus an optional PDF, on the product, falling back to
a store-wide default in the `store` settings group. Resolved in one place,
`App\Support\Store\ActivationProcedure`, because three things need the same
answer - the email, the order page and the console - and three resolutions of one
question is how the newsletter's footer address ended up being read three
different ways.

**The product overrides the default where it *says* something.** `?:`, not `??`:
a product edited and left blank stores an empty string, and `??` only falls
through on null - so a blank override would beat a perfectly good default and the
customer would receive no instructions at all. Exactly the newsletter footer's
bug. And the left operand is guarded with `?? null`, because `?:` reads it; the
fix for the empty-string bug is what caused "Undefined array key address" the
last time this pattern was applied without one.

**The procedure is emailed and the code still is not.** They are separate
messages on purpose. A licence key in an inbox is a licence key in every mail
server it passed through, which is why `OrderPaid` never carries one - and the
steps are not secret, so they can go by mail with the PDF attached while the code
stays behind the recorded reveal. `ActivationProcedureIssued` fires when the
codes are **issued**, not when the order is paid: under manual fulfilment those
are different days, and explaining how to activate a licence nobody has issued
generates the enquiry it was written to prevent.

**Lines sharing a procedure share an email**; two genuinely different ones are
two emails. Two identical messages arriving together reads as a bug in the shop,
and one message covering two different procedures makes the customer work out
which half applies to which key.

**A missing PDF is skipped, never thrown on.** The money has arrived and the
licence is issued; failing the notification because somebody tidied the media
library would lose the instructions as well as the file. Same rule the campaign
attachment follows. An unknown path is refused on *write* instead, because an
attachment that silently fails to attach is a message claiming a document the
customer never receives.

**The email renders the procedure as text, not as HTML.** A Laravel mail
notification escapes its lines, so passing stored markup shows the customer their
own tags. It goes through `HtmlSanitiser::toText()`, which spaces block elements
only - `strip_tags` runs the end of one paragraph into the start of the next. The
rich version is on the order page, which the email links to.

**The reveal control did not exist.** The endpoint shipped, the receipt told
people to "open your order to reveal it", and there was nothing on that page to
press - so no customer could ever obtain a code they had paid for. Same shape as
the newsletter's Groups screen being reachable from nowhere, and the same lesson:
**an endpoint with no control behind it is a feature that does not exist.**

**A code is never in an ordinary read.** The order says a code *exists*;
revealing it is a POST that is counted, because "they say they never got it"
against a row saying it was revealed three times is the whole of that
conversation. A GET would also be pre-fetched, proxy-logged with its URL and
cached. The admin listing does not print codes either — that screen is open on a
desk in a room people walk through.

**`digital_auto_fulfil` decides whether codes go out by themselves**, and both
answers are real: automatic is what a licence buyer expects, manual is what a
business wants while it watches a new gateway settle. **`Setting::get()` casts
by the row's declared type**, so a `boolean` row returns a real `false` and a
`!== '0'` comparison is true for a switched-off toggle — that shipped once and
ran automatic fulfilment with the toggle set to manual. The frontend has the
mirror image of the trap, where a setting is a string and `"0"` is truthy.

**Running out never fails a payment.** Money has arrived and cannot be un-taken,
so the line waits, the trail says why, and the desk alert leads with it.

**A coupon is stored on the basket as a code, never as an amount.** An amount
goes stale the moment somebody adds a line, and stale in the customer's favour
is a discount the shop did not agree to. It is re-validated at checkout too,
against the subtotal that transaction has just worked out — the basket checked a
moment ago, against a different one.

**A coupon that has become unusable does not fail the order**; it is dropped and
the order is placed at full price. Losing a basket over a discount is the wrong
trade.

**Coupon usage is a table, not a counter.** A `used_count` column cannot answer
"has *this person* used it", and cannot be made safe under concurrency without a
lock a unique index gives for free. The per-customer limit is keyed on the
**email address**, not `customer_id`: guest checkout means most orders have no
account when the code is used, so keying it on an account would let one person
use a "once each" code as often as they liked by not signing in.

**Usage is recorded at checkout, not at payment.** A single-use code has to stop
working the moment it is spent, and the gap between placing an order and paying
for it is exactly where a second tab would otherwise use it again. The cost is
that an abandoned order holds a use, which is the safer direction.

**The store emitted no structured data at all, and the marketing catalogue
emitted the wrong kind.** Measured when the shop was checked against Google
Merchant Center's requirements: no store controller called `withSchema()`,
`Store\ProductResource` had no `schema` key, `StructuredData` had no method
that accepted a `StoreProduct`, and `/store/products/[slug]` rendered only the
`BreadcrumbList` `PageHero` emits. The one part of the site that takes money
published no price to anything that reads a page — while `/products/{slug}`,
which cannot be bought from, emitted a `Product` with an `Offer` carrying a URL,
a currency and no `price`. An `Offer` without a price is invalid and reports as
an **error**; no `Offer` at all is merely incomplete, a **warning**, and the
truthful description of a catalogue nobody can buy from. `StructuredData::
storeProduct()` is the store's own builder with a real price beside
`product()`, which lost its `offers` node — deliberately not merged, because
the marketing one is price-free by design and a `price` key behind a condition
in that method is a number waiting to be invented.

**A feed is data, and the RSS is rendered where the escaper lives.**
`GET /api/v1/store/feed` returns rows keyed by the `g:` attribute each becomes;
`web/src/app/(marketing)/store/feed.xml/route.ts` builds the document with the
same `xml()` sink `blog/rss.xml` uses. That is the `JsonLd` boundary applied to
a second format: a product legitimately named `A <> B` must not be able to
close the document. Submit `https://www.technoware.in/store/feed.xml` as a
scheduled fetch in Merchant Center; the Offer markup on each page keeps the
listing current between fetches.

**Google's two price fields are the other way round from the columns, and the
first cut got it wrong.** `price_paise` is what is charged, `compare_at_paise`
the struck-through "was"; in a feed `price` is the regular figure and
`sale_price` the reduced one charged today. Sent through unchanged, both
carried the identical number — a claimed saving with no reduction behind it,
which Merchant Center treats as misrepresentation rather than a mistake.
`StoreFeedTest` pins the mapping.

**Availability is three-valued, and `inStock()` is not the source.** `inStock()`
is a boolean because a Buy button needs one, and it answers *true* for an
empty shelf the shop has agreed to back-order — correctly. Declared to Google
that is a claim the thing is held here, which is exactly the overstatement
accounts are suspended for. `StoreProduct::availability()` answers `in_stock`,
`backorder` or `out_of_stock` from the same fields in the same order, so the
listing and the feed cannot disagree about one shelf.

**`track_stock` was null on an unsaved model, and the test that found it passed
for the wrong reason.** `StoreProduct::$attributes` declared `allow_oversell`
alone; `track_stock` is `default(true)` in the column and `inStock()` opens with
`if (! $this->track_stock)`, so a product created and asked about in one breath
called itself in stock whatever its shelf held. The assertion that it "can
still be bought" went green on that null. Every boolean with a column default
is declared now — `track_stock`, `allow_oversell`, `returnable`, `is_featured`,
`feed_include` — which is what the rule about `is_active` on a variation said
all along and was applied to one field.

**The SKU is never offered as a manufacturer part number.** A SKU is this shop's
own filing code; an MPN is the manufacturer's. `gtin` and `mpn` are columns on
the product and on each variation (the 24-port and the 48-port are two
barcodes), read variation-first the way `stock` is, and a blank pair means
`identifier_exists: no` — which Google accepts and demotes, and is still true.
There is deliberately **no `identifier_exists` column**: it is derived from the
two being blank, and a stored flag would be a second answer free to contradict
them the first time somebody filled in a barcode without unticking it.

**`feed_include` is a separate decision from `status`**, the `show_in_menu`
argument: being sold here and being advertised on Google are different
questions. It is also the only way to clear a disapproved item without taking
the product off sale in our own shop to satisfy an advertising platform.

**Google rejects SVG, and this library is largely SVG placeholder art.** A
product whose gallery holds no JPEG, PNG, GIF, BMP, TIFF or WebP is left out of
the feed and **named** — `meta.problems` on the endpoint, `feed_problem` on the
admin resource, a "Not in feed" badge on the product where somebody can act.
Fed anyway, it is an item disapproved for a reason nothing on our side would
ever show; a rejected item is invisible until somebody opens Merchant Center
and reads a diagnostics page. Withheld and service products are counted rather
than reported: a warning list that includes decisions is one people scroll past.

**Delivery, handling and the return window are three settings read from one
place.** `store_shipping_paise`, `store_handling_days` and `store_return_days`
through `App\Support\Store\Fulfilment`, for the product page, the feed and the
Offer markup alike. They replaced *"Free Shipping — On every order across
India"* hard-coded in `content/site.ts`: a promise the API could not see and
therefore could not agree with, and a delivery charge on the page that differs
from the one declared to Google is the single most common suspension. The
`/returns` and `/shipping` pages point at the product page for the numbers
rather than restating them, or the prose would be a second copy free to drift.

**Those two pages are seeded as placeholders awaiting legal review**, exactly
as `privacy` and `terms` were, and are linked from the footer fallback and the
seeded bottom-bar menu — Merchant Center requires both to be reachable. Worth
knowing about all four: `PageSeeder` uses `updateOrCreate` keyed on slug, so
re-running it **overwrites** whatever an editor has written on those pages. It
always did; there are simply two more pages it now does it to.

**`AggregateRating` and `Review` are real now, and still never invented.**
They were absent from every graph by decision until the shop had reviews of its
own (2026-09-26, "Reviews" below). The store Product graph carries
`aggregateRating` from the product's stored summary and up to five `review`
nodes — published reviews only, the ones the page opens on — and nothing at
all until one is published. The marketing catalogue has no reviews and emits
neither.

**The store's catalogue is not the site's catalogue, and that is the whole
shape of the module.** `store_products` is its own table: what the shop sells is
maintained separately from what the site advertises, because the catalogue
exists to be found by somebody researching a project and most of it is quoted
per site rather than bought from a page. The first cut put `is_sellable` and a
price on `products` and was backed out. What the split buys beyond doing as
asked: the marketing catalogue keeps its shape, with no price column null on 200
of 210 rows and no Buy button one mistaken tick away — and **everything in
`store_products` is for sale by definition**, so a price is simply required and
there is no flag to forget. What it costs is a product both advertised and sold
being two rows, which was chosen deliberately. `brands` is reused because a
manufacturer is a fact rather than an editorial decision; categories are not,
for the opposite reason.

**Money is paise, as integers, everywhere — and GST is extracted, never added.**
`App\Support\Money` and `lib/money.ts`. A price is an exact count of the
smallest unit there is; a float cannot hold 118.10, and a `decimal` column comes
back from PDO as a string that the first arithmetic converts to a float anyway.
`taxable = total × 10000 ÷ 11800` and `gst = total − taxable`, in integer
arithmetic — **the GST is defined as the difference** so the two halves add back
up to what was charged at every amount. Computing it the other way round gives
the same two numbers most of the time and, on the roundings where it does not,
an invoice that disagrees with the money taken. `rupeesToPaise` parses the
*text* rather than multiplying: `parseFloat("11800.10") * 100` is
1180009.9999999999 in this runtime, and `Math.round` hides that exactly until
the day it does not.

**A cart line is a pointer and an order line is a snapshot.** Nothing about
money is stored on a cart, so every figure is recomputed from the product on
every read — which is why a price change reaches a basket that is already full.
An order item copies the name, the part number, the options, the price and
whether it could be returned, so renaming or deleting a product cannot change
what an invoice says was sold. The two are opposite on purpose and neither is a
cache of the other.

**GST is stored once at the order, never per line.** Apportioned tax rounds per
line and rounded lines do not sum to the rounding of the total. A per-line
breakdown, if it is ever wanted, is an apportionment at render time and not a
second set of stored figures free to drift.

**`GET /cart` is a read that writes, so it is throttled and pruned.**
`Cart::forToken(null)` mints and persists a row — that is how a first "add to
basket" gets a cart without the page that drew the button having to make one —
which made it the one public endpoint an anonymous caller could use to insert
unbounded rows at any rate. It was also the only cart route with no limit at
all. The frontend never did this (`lib/cart.ts` returns early with no cookie, so
a crawler creates nothing), but the frontend is not the boundary.

`technoware:prune-carts` deletes baskets untouched for **30 days**, matching the
cart cookie's own life so nothing is cleared out from under a browser still
offering to remember it. It ranges on `updated_at`, never `created_at`: a basket
opened two months ago and added to this morning is in active use. `lib/cart.ts`
claimed this command existed for as long as it did not.

**The basket is a token in an httpOnly cookie, because guest checkout is a
requirement.** A cart that needed an account would put every purchase behind the
portal's approval queue, which is a human being on a working day. Every line is
scoped to the token's cart, and a line in somebody else's basket is a **404, not
a 403** — a 403 confirms it exists. `Cart::newToken()` is `random_bytes`, not
`Str::random`.

**A guest who pays gets an account, and it is `active`.** Registering through
the front door leaves somebody `pending` until a human approves them; having
taken their money is a stronger statement than anything that queue establishes,
and making them wait to see their own order would be absurd. An address that
already has an account **keeps whatever status it has** — a purchase does not
overturn a decision a person made about a person. Either way the order is
reachable by `access_token` in the confirmation link, never by its number, which
is printed on paperwork and sequential.

**The token is never the address of a rendered page (2026-09-26).** It was:
the checkout redirected to `/order/{n}?token=…` and every email linked there,
on a page inside the marketing layout, where GA4 and the Meta Pixel report
`location.href` — so every order's key went to two third parties, and to any
`Referer`. Now `Order::url()` (and Cashfree's `return_url`, `?paid=cashfree`)
points at `/order/{n}/open?token=…`, a route handler that renders nothing,
stores the token in an httpOnly cookie with `path=/order/{n}` (lax, secure in
production, thirty days) and answers 303 to `/order/{n}`; the checkout action
sets the same cookie and redirects clean. The page and its three actions (pay,
confirm, reveal) read the cookie (`lib/order-access.ts`); no component takes the
token as a prop any more. A `?token=` reaching the page itself — an email sent
before this — is redirected through `/open`, never rendered. Analytics render
nothing on `/order/*` and the route sends `Referrer-Policy: no-referrer`. The
token must look like `bin2hex(random_bytes(32))` or the cookie is not set.

**The checkout re-reads and re-prices everything, under a lock.** `lockForUpdate`
on the products a basket touches, ordered by id — two baskets holding the same
two products in opposite orders would otherwise deadlock, which is the classic
failure under exactly the load this is meant to survive. Short stock refuses the
**whole** order rather than part-filling it: placing an order for whatever
happened to still be available means somebody paid for a basket they did not
assemble. There is a test that sends a price, a total and a discount in the
request and asserts none of them lands anywhere.

**The address is required by the basket, not by the form.** Something shipped
needs somewhere to go; a licence does not, and asking for a PIN code to sell one
is a form arguing with itself. `shipping_address` is null when nothing travels
rather than a copy of the billing one.

**The PIN code is asked for first, and it fills the three fields under it.**
Not the conventional order — street, town, post code — and deliberately so. An
Indian PIN code is administered top-down, so six digits determine the state and
very nearly determine the town: asking for them first turns three fields people
misspell, abbreviate or write six ways into three they only glance at. The
street is the one part a PIN code cannot know, so it is asked for last.
`components/forms/pincode-autofill.tsx`, dropped into the checkout and into any
editor-built form that asks for a PIN code plus one of country, state or city.

**Everything it writes stays editable, and that is load-bearing rather than
polite.** **1,229 of the 19,097 PIN codes straddle a district boundary** —
400001 is Mumbai *and* Raigarh — so a form that picks one and locks it is
confidently wrong more than a thousand times. And **district is not city**:
700091 is "North 24 Parganas" to India Post and "Kolkata" or "Salt Lake" to
everybody who lives there. So the lookup is a suggestion that types itself, the
alternatives are offered through a `<datalist>` on the city field — suggestions
without a single new tap target, which the audit counts — and a field is
**written only when it is empty or still holds exactly what was put there
last**. Type over the city, correct a typo in the PIN code, and the city you
typed stays. Without that rule "editable" means "editable until you touch the
PIN code again".

**The table is vendored, not depended on.** `scripts/build-pincodes.mjs`
generates `lib/pincode-data.ts`; nothing is installed at runtime. Every
published package is one of two things: `pincode-lookup` is 68KB gzipped and
maps **110025 — Jamia Nagar, Delhi — to Budaun in Uttar Pradesh**, and is seven
weeks old with one version and one maintainer, which is not what belongs
between a customer and a checkout in a public repository;
`india-pincode-lookup` has the right answer and is 18MB of JSON scanned with
`Array.filter` on every lookup. So the second one's data is reduced once to the
PIN codes this form needs and committed — no runtime dependency, no
third-party request carrying a customer's PIN code, and nothing a future
version can change underneath us. Regenerating is three lines at the top of the
generator. The source either way is India Post's own directory, and it is
treated as **hostile input**: one row really does carry a stray backtick in a
taluk name, which ended the template literal and was found by `tsc` rather than
by reading.

**`lib/pincode.ts` is `server-only` and the lookup is a route handler.** The
table is 783KB. Shipping it to the browser to save one 200-byte request would
be the wrong trade on the page where somebody is about to pay, and every
visitor would carry it for the few buying something shipped — verified after
the build by grepping `.next/static` for a district name and finding none.
`/api/pincode/[code]` is a GET of a fact that does not change, so it caches;
a Server Action would cost a POST and a render pass for 200 bytes. It is public
and unauthenticated, which is right: it is India Post's published directory and
a `Map` read, so there is nothing to protect and nothing a caller can make
expensive. A day of caching, not `immutable` — a boundary correction has to be
able to reach somebody who already asked.

**A failed lookup never touches the address.** Unknown PIN code, network gone,
API down: the message says to fill the three fields in by hand and every field
is left exactly as it is. The one thing that must not happen on a checkout is a
convenience taking the form down with it.

**Payment: the browser's word is a convenience and the webhook is the truth.**
`verify` exists so the person sees the right page at once; the webhook settles
the order whether or not the browser survived the redirect. Both go through one
`Settlement`, which is idempotent, so the two reporting the same success produce
one paid order.

**Idempotency is the unique index on `payments.gateway_payment_id`, not a
check.** The check-then-insert version passes every test written on one thread
and is a race in production: two deliveries land milliseconds apart, both see no
row, both insert. A duplicate is caught and read as the answer. Gateways retry —
documented behaviour, not an edge case — and without this the second delivery
marks the order paid again, takes the stock again and issues a second activation
code.

**A webhook always answers 200.** A gateway reads anything else as "try again",
so refusing loudly turns one delivery into an escalating retry storm, and a
retried bad signature is still a bad signature. It also tells whoever is probing
which of their guesses parsed.

**The webhook signature is over the raw body.** `$request->getContent()`, never a
re-encoded array: `json_encode` of the decoded payload is a different string and
therefore a different HMAC. That is the classic way this verification is written
and quietly never matches, so `PaymentTest` signs the exact bytes it sends.

**Razorpay's two secrets are not interchangeable.** The **key secret** signs the
browser's return; the **webhook secret** signs a server-to-server callback and is
set separately in their dashboard. Using one where the other belongs produces a
signature that never matches, which reads as "payments silently stopped" rather
than as a configuration mistake — the same shape as Mailgun's `secret` against
Brevo's `key`.

**A stock shortfall never refuses a payment.** Money has arrived and cannot be
un-taken, so the order is paid and its trail says somebody must check before
dispatch. Refusing would leave a customer charged for an order the shop is
pretending it never received.

**A payment for the wrong amount is recorded and settles nothing.** Either a
misconfiguration or somebody replaying a cheaper order's callback — and it must
be *recorded*, because money that arrived and cannot be matched is exactly what
somebody needs to see.

**The shop's search suggestions are a listbox, and the two datalists are not
the precedent for them.** The company field and the PIN code's city suggest
through a native `<datalist>` — no new tap targets, no keyboard code, degrades
to a plain input — and that is right for a list of *names*. The shop's list is
pictures: a thumbnail beside the name is what tells the 24-port from the
48-port at a glance, and a datalist can draw nothing but text. So
`store-search.tsx` is a WAI-ARIA combobox and pays the cost the datalists
avoid, once. Two things in it are load-bearing: options are pressed on
`mousedown` with the default prevented, so the input never blurs on the way
to a click and blur can safely close the list; and the list is `hidden` rather
than unmounted, so `aria-controls` always points at something and a closed
list contributes nothing to the audit's overflow or tap-target counts.
`/api/store/suggest` proxies the storefront listing with `cache=false` — a
`?q=` has an unbounded key space and must never fill the ISR cache — and sets
only a short *browser* cache, which is bounded per person.

**A card's hover images mount on the first hover, not with the grid.** A
picture at `opacity: 0` in a well that is on screen is not lazy to the
browser — `loading="lazy"` fetches it anyway — so stacking every view on
every card would fetch two extra photographs per card for a hover most cards
never get. `card-images.tsx` renders the first view alone and adds the rest
when the card is entered; the first crossfade is 1.1s later, which covers the
fetch. The listeners sit on `closest("article")` rather than on the well,
because "mouse over the product" means the card, and `focusin`/`focusout`
are wired beside them or the feature exists for a mouse only.

**The basket strip is the shop's own chrome, not an addition to the site
header.** That row is at its measured limit — both flanking groups are
`shrink-0` and the consultation button is a fixed 150px — and adding to it would
reopen the 320px overflow the logo cap exists for. `store/layout.tsx`, the same
answer `NewsletterNav` gives for the newsletter's screens.

**A sticky element is held by its own parent, so the filter strip has to be a
direct child of the block it follows (2026-09-23).** The strip is
`lg:sticky lg:top-[var(--h-site-header)]` and it was released at the
pagination — it docked for the products grid and then slid up behind the
header while the promo band, the latest products and the trust strip were
still to come. A wrapper `<div>` spanning the shop had been added for exactly
this in September and did nothing, because the strip sat one `Container` deep
inside the first `<section>` and `position: sticky` never looks past the
element's own parent box: measured at 1707px, it released at an absolute top
of 1979 inside a wrapper running to 3714. `/store` renders `StoreFilterBar` as
a direct child of that wrapper now and passes the container's gutter through
the new `className` prop — `mx-auto w-[calc(90%+0.5rem)]`, the extra 0.5rem
being what `px-1` spends, so the *card* lines up with the grid to the pixel
(84.6 and 1607.4 on both, measured) while the opaque band still clears its
rounded corners. The space above it is a **margin**, because padding would sit
inside the stuck box as a permanent band. The category and product pages
already held it in one page-length `Container`, which is why only the shop
front was wrong.

**The strip sticks at every width from 2026-09-23, at the client's request.**
It was `lg` and up on a measurement that still stands: the strip is three rows
and 201px tall at 390px, so it and the header hold about a third of the
screen. What the client weighed against it is that the basket lives in this
strip and the phone header carries none, so a strip that scrolls away leaves
somebody halfway down a listing with no way to reach the basket or the search
without going back to the top. The band is `py-2` below `lg` so the stuck
height is the strip and not a frame around it.

**Two products to a row on a phone (the client, 2026-09-23), which is what the
card was already written for.** `product-card.tsx`'s own note describes a grid
running "from two columns on a phone to six on a wide screen" — every store
grid said `sm:grid-cols-2`, so a phone got one. The grids are `grid-cols-2`
from the base width now, `sizes` moves from `100vw` to `50vw`, and the card's
type steps down one rung below `sm`: a 16px title and a 20px price in a 170px
cell wrap the name to three lines and shout the price. Nothing goes under
12px, which the public site's floor would lift back anyway.

**The two promo tiles sit directly above the trust strip (the client,
2026-09-23).** They were between the products grid and the promo band, where
two editor-set pictures interrupt the shop between what is for sale and the
rest of it.

**The checkout asks for a Mobile, and the wire key is still `phone`.** The
label is the word this audience uses for the number a courier rings; the key is
what `orders.customer_phone`, both order resources, the console, the mock and
the customer's account all call it, and renaming it to match a label is a
migration across five files a buyer never sees. The number is checked for shape
in `CheckoutRequest` — ten digits opening 6–9, optional `+91`/`91`/`0`,
separators anywhere — never against a lookup.

**`orders.customer_note` is the buyer's own note, and it is not `notes`.**
`Order::notes()` is the desk's staff-only relation, so an attribute of that
name would shadow it — an `$order->notes` that is sometimes a collection and
sometimes a string is a collision nothing reports. Optional, stored as typed
with its line breaks, read back on the buyer's order page and drawn on the
console's order screen beside the address, which is the screen the parcel is
packed from. On the admin **detail** only, like the addresses: it is prose, and
a queue is scanned a row at a time.

**The order page's alert reads `paid_at`, not the status.** It said "Payment
received" for every order past `pending_payment` — which is a
cash-on-delivery order, born `confirmed` with nothing paid, the moment it was
placed. The client caught it on 2026-09-16. It now warns while
`pending_payment`, thanks while `paid_at` is set, says "Order confirmed — you
pay the courier when it is delivered" for the confirmed-unpaid case, and
says nothing for a cancelled one. Placed a real COD order to prove it (the
ceiling refused the first attempt at ₹58,000, which is the ceiling working)
and deleted it afterwards.

## Merchant Center: the named feed, the shipping window, the policy names (2026-09-17)

The client's checklist for the shop, against what was already there.

**The feed exists and is complete; it gained the address a reviewer
types.** `/store/feed.xml` has carried id, title, description, link,
images, availability, price and sale price, condition, brand, GTIN/MPN,
`identifier_exists`, product type, shipping and handling since the feed
shipped; `/google-shopping-feed.xml` now serves the same handler (a route
of its own that calls the feed's `GET` — Next refuses a re-exported
segment config), so Merchant Center can be pointed at either. `g:id` stays
`sp-<product>`, not the SKU, for the reason the feed's docblock gives: a
SKU is nullable and editable, and a changed id deletes an item's history.

**Shipping carries a service and a transit window.** `store_shipping_service`
("Standard Shipping"), `store_transit_days_min` (3) and
`store_transit_days_max` (7) in Store → Settings; `Fulfilment::shippingService()`
and `transitDays()` (the maximum never below the minimum — a window typed
backwards is a form error, not a shorter promise, and Merchant Center
refuses it). The feed's `<g:shipping>` block names `<g:service>`,
`<g:min_transit_time>` and `<g:max_transit_time>` beside the country and
the price, and the shipping page's copy says the same three-to-seven.

**The policy pages answer under the names checklists quote.**
`PolicyRedirectSeeder` writes `/return-policy`, `/refund-policy`,
`/shipping-policy`, `/privacy-policy`, `/terms-and-conditions` (and three
more) as 301 rows to `/returns`, `/shipping`, `/privacy`, `/terms` — rows in
the redirects table rather than routes, so the console can see and edit
them; idempotent, an edited row is left alone. The bottom bar's default
already pointed at all four pages; the live install's bottom menu gained
Returns and Shipping the same day. `EmbedSettingsTest` pins the window and
the aliases.

**Cashfree is the second gateway, and the three ways it is not Razorpay are
each pinned by a test (2026-09-18).** `App\Support\Store\Payments\CashfreeProvider`,
on the seam `PaymentGateway` and `PaymentProvider` left for it; Paytm stays
"not built". Store → Settings → Payments offers it with an App ID, a secret key and
an environment (sandbox or production, a select — sandbox keys answer 401
against the live host and the reverse), and the enum's `fields()` grew an
`options` shape for that one control. What differs:

- **Rupees, not paise.** Cashfree's `order_amount` is a decimal in rupees,
  so this is the one place in the payment code money is turned into a
  decimal and back — `rupees()` and `paise()`, on integers and strings,
  never through a float: `11799.99 * 100` in a double is 1179998.9999…,
  and a payment one paisa short settles nothing. The round trip is a test.
- **The browser's return proves nothing.** Razorpay hands the page a signed
  triple; Cashfree's checkout resolves with nothing worth trusting, so
  `verifyReturn()` ignores the payload and asks `GET /pg/orders/{id}/payments`
  with the secret whether the order has a `SUCCESS` payment — the webhook's
  trust boundary, arrived at from the other side. The Pay button posts only
  `{gateway: "cashfree"}` to `/verify`.
- **The webhook signs `timestamp . rawBody` with the client secret**, base64
  — there is no separate webhook secret, and the panel says so in place of
  the Razorpay note. Events `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`
  and `PAYMENT_USER_DROPPED_WEBHOOK`; dropped is a failure here, since
  nothing was charged.

Our order number is Cashfree's `order_id`, so the webhook and the lookup
both name it and asking twice returns the same order; the customer's phone
goes over as ten digits with an Indian code stripped; the return URL is the
order page on `frontend_url` and the notify URL this API's webhook route.
The browser loads `sdk.cashfree.com/js/v3/cashfree.js` beside Razorpay's
script and opens the checkout as a modal (`redirectTarget: "_modal"`), so
the confirm step runs on the page; the CSP names the SDK, both API hosts
and the `payments*.cashfree.com` frames. `GET /admin/settings` carries
`meta.payments.webhooks` keyed by gateway — each has its own URL and event
names — and the flat `webhook_url`/`webhook_events` pair stays as the
Razorpay fallback. `CashfreePaymentTest` fakes every call: rupees on the
wire and never the secret, the production host for production keys, a
return refused until Cashfree confirms it, a confirmed return settling, a
bad webhook signature answering 200 and changing nothing, a signed one
settling, three deliveries settling once, a wrong amount recorded and not
settled, a dropped payment recorded as failed. Not verified against a real
Cashfree account — that needs the client's keys; the sandbox is the place
to do it, and the environment select is what makes that safe.

**Place order fires Velora's confetti from the press (2026-09-18).** The
burst already fired on the basket bar's Checkout link and, larger, on the
order page's arrival with `?placed=1`; the client asked for it on the button
itself. It fires only when the browser's own validation would let the submit
go — `e.currentTarget.form.checkValidity()`, so a burst never celebrates
"this field is required" — and from the button's centre when the press was
a key, where `clientX` is 0. Measured with a probe that drove the real
basket into `/checkout` and swallowed the submit in the capture phase: no
canvas on the invalid form, one on the valid one, gone after two seconds, no
order placed. The first cut of that probe asked `document.querySelector("form")`
and got the header's search form, which is valid whatever the checkout says.

**A refund is a row, and the status follows the sum (2026-09-20).** "Refunds
are a status, not an action" was the open item: the dropdown could say
`refunded` and nothing said how much, to whom, or against what reference.
`POST /admin/store/orders/{number}/refunds` (`ManualRefund`, beside
`ManualPayment`) records the amount, the gateway's or bank's reference and
who confirmed it as a `payments` row with status `refunded`. It moves no
money — the brief does not ask for that, and whoever returns it does so in
the gateway's dashboard — and it refuses an unpaid order, an amount past
what is left to return, and an order already refunded in full. Partial
refunds accumulate and leave the status alone, said in the trail; the amount
that completes what was paid makes the order `refunded`, terminal, with the
stock left where it is (a refund is money, not goods). The report's
`refunded_paise` still counts orders in `refunded`, so a partial refund is on
the order and in the trail rather than in that figure.

## The catalogue as a spreadsheet (2026-09-20)

**`GET /admin/store/products/export` writes one row per product and one per
variation, in the columns the import reads back.** `CatalogueImport::FIELDS`
is the one list both sides use, so a file exported, edited in Excel and
uploaded again maps itself — "change forty prices" is a spreadsheet job, not
forty edit forms. A variation's row carries its product's SKU in `parent_sku`
and its own in `sku`; a product's row leaves `parent_sku` blank, and that is
the whole of how the importer tells the two apart. Money is
`Money::toRupeeString()` and every cell goes through `Csv::escape`, the two
rules above about a file somebody opens in Excel.

**The import is a dry run and then a commit of the same file**, the
newsletter importer's shape and for its reason: reporting afterwards means the
moment somebody notices they mapped the cost column onto the price is the
moment after two hundred prices went live. `CatalogueImport::plan()` is one
walk that both passes share, so the counts somebody approved are the counts
the commit produces — two walks with two sets of rules is a preview that says
"40 updated" over a commit that does 38. The console re-reads the dry run on
every column change, and a blank mapping sent back beats a guess, or a wrong
guess could never be undone.

**Matching is by SKU, and the import never creates a variation.** A line whose
SKU is a variation's updates that variation; one whose SKU is a product's
updates the product; one matching nothing creates a product, which needs a
name and a price and nothing else. A line naming a `parent_sku` can only
update, because a variation is a set of options a buyer picks from and a
spreadsheet cell cannot say what those are — the product form can. A SKU that
matches more than one row, or is repeated in the file, is refused rather than
guessed at — naming the first line, because a spreadsheet joined from two
sources routinely repeats.

**A blank cell leaves the field alone.** A file exported to change forty
prices carries every other column too, and a blank in one of them means "I
did not fill this in", never "clear it". Only a mapped, filled cell writes;
clearing a value stays a job for the edit form. An importer that *could* blank
a hundred descriptions because a column was empty would have on the first
file anybody tried.

**Money and enums are refused, never coerced.** `Money::fromRupeeString()`
parses the text — `₹1,179.99` and `1179.99` alike, the sign and the commas
stripped first — and never goes through a float, the rule `rupeesToPaise`
follows on the other side; a cell it cannot read makes the line `invalid`,
because "call for price" must not become ₹0. `status`, `condition` and `type`
outside their enums are refused; a category or brand slug nobody has refuses
the line and never mints one, because a typo in a spreadsheet would otherwise
create a category.

**Each line is its own transaction.** An unknown category on line 40 costs
line 40 and nothing else; the rest of the file goes through, and the line is
named in `problems` with its reason. Fifty problems are kept per file — a
spreadsheet of five hundred bad rows is a wrong mapping, and the first fifty
say so as well as the five-hundredth.

**Stock changes go through the ledger with the import's name on them.**
`StockLedger::adjusted()` grew a `$source`, written in front of the level
change — `Import #12: changed from 10 to 40.` — so a row in the ledger says
which spreadsheet put forty on the shelf rather than reading like somebody
typed it. A new product's opening stock is `Initial`, as from the form.

**`store_product_imports` is the record**: who, which file, the mapping, the
counts and the refused lines as JSON. The spreadsheet itself waits on the
private disk between the two steps and is deleted once read; the copies a
re-mapping leaves behind are pruned after a day.

**`Csv::guessMapping` was left alone and the store has its own.** The
newsletter's guesser reads "name" as a first name and "address" as an email,
which is right for a list of people and wrong for a list of products; the two
share nothing but the idea, and a shared table would need every entry to say
which importer it was for.

**`compare_at` on a variation's row is exported blank and ignored on import.**
The specification named it, and `store_product_variations` has no such
column — a variation's "was" price is the product's.

## Back-in-stock notices (2026-09-20)

**`POST /store/products/{slug}/notify` answers 202 and one sentence, always.**
The `/auth/register` rule: a form that answered differently for an address it
recognised is a membership oracle. A filled honeypot, an address on
`newsletter_suppressions` and a shelf that is not empty — back-ordered counts
as buyable, which is what the switch means — all get the answer a written
request gets, and only that last case writes a row.

**One row per address per shelf, re-armed rather than repeated.**
`stock_notices` is unique on the product, the variation and the address, and
`notified_at` is the whole state: null waiting, set told, cleared re-armed. A
second request for a notice already sent clears the stamp, because "tell me
again next time" is exactly what it means. `StockNotice::arm()` finds before
it creates: MySQL treats a null variation as distinct in a unique index, so
the index alone would let "any variation" rows pile up.

**A signed-in customer is stamped from the guard by name.** The route is
public, so `$request->user()` is always null there and reads as working — the
trap `CLAUDE.md` records for comments and the chatbot. `$request->user('sanctum')`,
narrowed with `instanceof Customer`, and the Server Action forwards the portal
token; `StockNoticeTest` sends a real bearer header rather than `actingAs`,
for the reason that section gives.

**The trigger is `StockLedger::record()`, on every positive delta.** The one
place stock ever goes up, so nothing can put something on a shelf and forget
to say so; a trigger at each caller is a caller that forgets. Dispatched
`afterCommit`, because the product form saves inside a transaction and a
worker can be faster than a commit.

**The job re-checks the shelf when it runs.** `SendStockNotices` trusts
nothing the movement said: an adjustment can be corrected a second later, and
a queue drained once a minute would otherwise announce a delivery that was
already typed away. A variation arriving answers the notices for that
variation and the notices for "any"; the notices for the other variation
wait.

**Idempotent by the row.** `notified_at` is stamped per notice as it goes out
and only unstamped rows are read, so two movements in one minute — two jobs
— tell each person once. The suppression list is read at send time as well as
at request time: an address suppressed after asking is skipped and left
unstamped, so a lifted suppression is still owed its notice. Every send goes
through `Notifier` and never throws — a dead mail server must not leave a
failed job re-sending the first half of the list on every retry.

**`back_in_stock` is in the message catalogue** with the product, the
variation, the price *today* and the two links; the cancel link removes one
notice and is not an unsubscribe, and the wording says so.
`GET /store/stock-notices/{token}/cancel` deletes the row and answers the same
200 for a link already used and a token nobody has, so the endpoint cannot be
used to test which tokens exist.

**The storefront form is a sibling of the basket form, keyed on the choice.**
A form cannot hold a form, so `StockNoticeForm` sits under `AddToBasket`'s
`<Form>` and appears on the same flag that disables the button — `in_stock`
false, which a back-ordered shelf never is. It is prefilled from
`/api/store/me` *after mount*, never during render: the product page is
served whole from the ISR cache, and the same reasoning that made the basket
count a client component applies. That route answers 204 with no API call
when there is no portal cookie.

**The console reads one scope.** `StockNotice::scopeWaiting()` is what the
products list counts (`notices_waiting`, a `withCount` on every read),
filters (`?notices=1`) and the dashboard's `awaiting_stock` links to — a tile
reading "3" that opens a list of five is worse than no tile.

## The promo band is edited from Store (2026-09-20)

The dark band on `/store` — kicker, price line, heading, subheading, button,
picture — is eight `store_promo_*` settings rows, and until now they were the
last eight fields of Settings → Store. That was the wrong door twice: the
person running a promotion is the store manager, who cannot open Settings at
all, and a banner on the shop front is looked for under Store.

**A group of its own, and an endpoint of its own.** The rows moved to a
`store_promo` settings group (the seeder refreshes an existing row's group on
its next run, so nothing is retyped) so the settings strip can leave them out
through `STANDALONE_GROUPS` — the info bar's rule: a sidebar row *and* a tab
is two doors to one form. `/admin/store/promo` is the screen, under Store
beside Discount codes, and `GET`/`PATCH /admin/store/promo` is what it reads
and writes, under `role:store_manager` in `routes/api/admin-store-manager.php`.

**The allowlist is the door.** `PromoController::KEYS` is the whole of what
the endpoint may touch, and a key outside it is a 422 naming the key rather
than a silent skip — `PATCH /admin/settings` ignores unknown keys, which is
right for a form carrying thirty and wrong for one whose purpose is to hand a
narrower role a narrower door. `StorePromoTest` sends `store_shipping_paise`
through it and asserts the request saves nothing. Settings as a whole stay
`role:admin`; an administrator may still write the same keys from either
screen.

**The shop front did not change.** `PromoBanner` reads the public settings
map by key, and `PublicSettings::GROUPS` names the new group so the keys
keep being published; the `_path` → `_url` rule reaches a row whatever group
it is in. The save calls `updateTag("settings")`, so the band shows the
change on the next request — measured by renaming the heading through the
real form as a store manager and reading `/store`.

**Two tiles above the band (2026-09-21), through the same door.** The client
asked for two 50/50 banners between the top picks and the band, editable in
the console. They are the band's shape minus the price line, twice: seven
`store_tile_{1,2}_*` rows in a `store_tiles` group (standalone like the
band's), drawn by `components/store/promo-tiles.tsx` and edited on the same
Promo banners screen, written through the same `PATCH /admin/store/promo` —
whose `KEYS` grew to twenty-two and whose three per-key checks (the switch,
the link's shape, a picture the library knows) now run by **suffix**, so the
tiles are held to the band's rules without the checks being written three
times. A tile draws only when its switch is on and it has a heading or a
picture, the band's rule; one tile alone takes the whole row at the band's
flatter ratio rather than half a row beside a hole; neither, and the section
is not rendered. The ratio applies from `lg` only and the picture is not
drawn below `sm`, because a heading, a line and a button need more than a
16:9 box gives them at 320px. `StorePromoTest` covers the order the rows
come back in, the suffix checks, and a `store_tile_3_*` key being refused
by name.

## Abandoned baskets (2026-09-25)

Phase 2, stream A (`docs/phase-2-contract.md`). Up to two emails to somebody
who left something in their basket; the second may carry a coupon.

**The address is kept before any order exists, because that is the basket
that is abandoned.** The checkout saves the email and the mobile as each
field loses focus — a debounced Server Action, `saveCartContactAction`, to
`PATCH /cart/contact` — and says on the line under the email field that a
reminder may follow if the order is not finished. That line is drawn only
while reminders are switched on (`contact.reminders` on every basket read),
and `contact_consent_at` is stamped only then, so an address typed while no
reminder was promised is never mailed. The mobile is held to the checkout's
own rule (`CheckoutRequest::MOBILE_PATTERN`); each field is written only when
sent, and a blank clears it. The action never reports anything — a
half-typed number is the order form's to word when it is submitted.

**A signed-in customer's basket is claimed from the Bearer.** The Next
server forwards the portal token on every basket call (`getCart()`, `call()`
in `components/store/actions.ts`, `placeOrder()`), and the API reads it with
the guard named — the routes are public, the `$request->user()` trap — and
stamps `carts.customer_id` on a basket nobody has claimed. A "View as" token
claims nothing: that browser's basket is the staff member's, and stamping it
would send the customer reminders about it. Claiming is written with
timestamps off, so it is not activity. The merge of a guest basket into an
account's on sign-in is not this stream's (the wishlist stream owns the
sign-in hook).

**Idle is `carts.updated_at`, and nothing in the reminder path moves it.**
It is the column every basket action touches and the prune reads. The claim
on a basket, the reminder stamps, the restore token and the checkout's
`recovered_order_id` are all written through the query builder or with
timestamps off; otherwise the second reminder's clock would restart from the
first and the prune would keep a basket alive by mailing about it.

**Who is reminded** (`CartReminders::due()` then `send()`):

- a basket with lines, whose lines still price (an unpublished product drops out of the summary);
- with a contact — an address with its consent stamp, or an account (reached at the account's address when the basket has none of its own);
- no `recovered_order_id`;
- idle past `store_cart_reminder_1_hours` (1–72) for the first, and not idle over **seven days** — switching reminders on must not wake a month of old baskets at nine the next morning;
- idle past `store_cart_reminder_2_days` (1–25) for the second, **and** twelve hours after the first, so a first reminder held overnight by the quiet hours is not followed an hour later by the second;
- whose address is not on `newsletter_suppressions`;
- only while `store_cart_reminders_enabled` (off by default) and `QuietHours::allows()` — outside the window the run does nothing, and the next run inside it sends.

Each basket is **claimed with a conditional UPDATE** on `reminders_sent`
before anything is sent, so two overlapping runs cannot tell anybody twice;
the schedule adds `withoutOverlapping` anyway. A run takes at most 200 per
stage, second reminders first.

**Each reminder is an email and a `Messenger::notify()`.** `CartReminder` is
one class and two catalogue messages, `cart_reminder_1` and
`cart_reminder_2` (the `TicketReplied` arrangement), queued through
`Notifier`, with the basket priced when the job runs. The second carries
`store_cart_reminder_coupon` only when `Coupon::refusalFor()` passes for that
basket's subtotal and address — the same check the basket and the checkout
make — so an email never offers a code the checkout refuses. The console
refuses a coupon code that does not exist and stores it normalised.

**The link restores the basket; it never carries the cart token.** The
first reminder mints `restore_token` (64 hex, unique). The email links to
`/store/basket/restore/{restore_token}`, a route handler that swaps it for
the cart token through `GET /cart/restore/{token}`, sets the `tw_cart` cookie
(`CART_COOKIE` in `lib/cart.ts`, shared with `setCartToken`) and answers 303
to `/cart?restored=1` — a path, so behind Plesk the browser supplies the
origin. A basket that has become an order, or an unknown token, is a 404 and
lands on `/cart?restored=0`, which says why the basket is empty. The basket
page is `/cart`; the contract's `/store/basket` exists only as the restore
link's prefix.

**The unsubscribe is the newsletter's own route.**
`/newsletter/unsubscribe/{restore_token}` — the same page and the same
`GET`/`POST /newsletter/unsubscribe/{token}` a campaign uses, which now fall
back to a basket's restore token when no subscriber holds it, and answer by
putting the address on the suppression list (and marking a subscriber row at
that address unsubscribed). The email carries `List-Unsubscribe` and
`List-Unsubscribe-Post` for the same reason every campaign does.

**Recovered means reminded first.** The checkout stamps `recovered_order_id`
on every basket it orders from, which is what stops reminders; the store
dashboard's `recovered` counts it only on a basket that had a reminder in the
window, and `revenue_paise` only for those orders that are paid (the one
definition). **Null, not zeros, when no reminder went out** — reminders off,
or nobody left an address. A reminded basket is pruned at **ninety** days,
not thirty (`technoware:prune-carts --reminded-days`), because its row is
the only record of the reminder, and the dashboard's longest window is
ninety days.

**The settings are a group of their own, `store_reminders`, and private.**
The `store` group is public — all of it reaches `/settings` — and one of
these rows is a coupon code, which on the public map is a discount for
anybody who reads the page source. Drawn on Store → Settings beside `store`
and `payments`; the switch is a two-option select, the delays are refused
outside their ranges rather than clamped.

`CartReminderTest` covers the contact endpoint, the claim and its "View as"
exception, every selection rule from both sides, the coupon rule, restore,
the unsubscribe fallback, recovery stamping, the dashboard figure, the prune
window and the settings' refusals.

## Wishlists (2026-09-25)

The client asked for a wishlist for **guests and accounts, merged on sign-in**,
feeding **back-in-stock and price-drop** messages (`docs/phase-2-contract.md`,
section C). It is the basket's shape everywhere it can be, and the places it
is not are the interesting ones.

**A guest's list is a token; an account's list is the account.** `wishlists`
holds a 64-hex `token` from `random_bytes` (the basket's) and a unique,
nullable `customer_id`. The token reaches a list only while `customer_id` is
null (`Wishlist::scopeGuest`), and an account's summary sends `token: null`.
The alternative — a cookie that keeps addressing a list after it joined an
account — hands the last customer's list to whoever uses the computer next.
The Next server reads a null token as "forget the cookie" (`rememberWishlist`
in `lib/wishlist.ts`), which is also how the cookie is cleaned up after a merge
that happened on a request that was not a sign-in.

**Signing in merges, on either path, never under "View as".** `Wishlists::claim()`
folds the guest's lines into the account's (a line both hold keeps the
account's row, whose save price is the older) and deletes the guest's row, in
one transaction under `lockForUpdate`. It runs from `AuthController::issueToken()`
— the one place both sign-in endpoints finish — when `lib/auth.ts` forwards
`X-Wishlist-Token`, and from `Wishlists::resolve()` on the first request that
carries both a bearer and a token. An impersonation token is refused the merge:
a staff member's browser holding a guest list of its own must not put their
shopping into the customer's account. Guarded — a failed merge is reported and
the sign-in answers as it would have. `WishlistTest` sends a real bearer header
throughout, for the reason `CLAUDE.md` gives.

**A read never writes.** `GET /wishlist` with nothing in hand is an empty
summary and no row, unlike `GET /cart`, so it needed no floor under it; the
first heart pressed mints the list. `technoware:prune-wishlists` deletes guest
lists untouched for 180 days, the cookie's own life; an account's list stays.

**One line per list, product and variation, and the database says so.**
MySQL treats NULLs as distinct in a unique index, so "any variation" would
slip past `(wishlist_id, store_product_id, store_product_variation_id)`.
`variation_key` is the variation's id or 0, written by `WishlistItem`'s
`saving` hook, and the unique index is on that. Not a generated column: MySQL
refuses a CASCADE foreign key on the base column of a stored generated one,
and a deleted variation has to take its lines with it. A second press is the
same line; a race that loses to the index reads the winner back.

**A line is a pointer with one remembered number.** Like a basket line it
shows the price *now*; `price_at_save` is the one figure kept, because a price
drop has to be measured from something. A product-level line on a product
with options cannot go straight into a basket — the API answers the basket's
"Choose an option" 422 and the line stays — so the list offers "Choose
options" on the product page for it (`needs_choice`).

**The hearts and the count never make a shop page dynamic.** Every heart on a
card, the product page's Wishlist button and the strip's count are client
islands (`WishlistHeart`, `WishlistIndicator`) drawn empty by the server and
filled from `/api/store/wishlist` after mount — the `BasketIndicator` rule —
and they share one fetch through a module-level store read with
`useSyncExternalStore` (`lib/wishlist-events.ts`), because forty hearts on a
grid asking separately is forty requests for one answer. The route handler
answers 204 with no API call when there is neither a wishlist cookie nor a
portal session, and strips the token from what it returns. A press is
optimistic, ignores a second press while the first is in flight, and
announces `tw:wishlist` with the new list as its `detail`.

**The heart's motion is the `scale` property and one keyframe.** The press is
`active:scale-*` through `transition-[scale,…]` (the Tailwind v4 trap), and
becoming saved pops the glyph once through `.wish-heart[data-pop] svg` inside
the reduced-motion guard. `data-pop` is set only by a press: were it keyed on
the pressed state, every saved heart on a grid would pop together the moment
the list arrived.

**Back in stock follows the shelf in both directions.** `StockLedger::record()`
queues `SyncWishlistStock` (after commit, and only for a product somebody
saved — one indexed read otherwise) on every movement, and the job trusts
nothing the movement said: it re-reads the shelf, arms every line whose shelf
is empty (`awaiting_stock_at`), and tells each armed line that is buyable
again. A line saved while the shelf was empty is armed at once. So a restock of
something that never ran out tells nobody, and a sale that empties the shelf
arms the line for the next arrival — "once, re-arming when it goes out again".

**A price drop is measured from what they were last told.** The product's and
the variation's `updated` hooks queue `SendWishlistPriceDrops` when
`price_paise` falls (a variation on any change, since going from the
product's price to one of its own is a change `price_paise` alone does not
describe). A line is told when the price now is at least
`store_price_drop_min_percent` (Settings → Store, default 5, refused outside
1–90) below its reference — the price saved, or the price last told,
whichever is lower — and telling it records the price told. So one drop is one
message, a wobble back up and down to the same figure is not news, and only a
further fall from there is. Whole paise throughout: `now × 100 ≤ reference ×
(100 − p)`. A drop on something that cannot be bought waits.

**Once, even with two jobs.** Both jobs claim a line with a conditional update
before sending — `awaiting_stock_at` not null, or `price_drop_notified_paise`
unchanged — and only the row that changed gets an email. Two movements a
second apart, or a deferred job running beside a fresh one at nine o'clock,
tell each person once.

**Promotional, so quiet hours and the suppression list.** Both events are
`promotional()`: outside `QuietHours::allows()` the job still arms what it
must and re-dispatches itself delayed to `QuietHours::nextOpening()` rather
than sending. An address on `newsletter_suppressions`, a guest list with no
address, an account that may not sign in and a list whose stop link was
pressed are all skipped **and left owed** (`WishlistMail::address()`), so a
lifted suppression or an address given later is still told — the stock
notice's rule.

**A guest is told only if they ask.** The `/store/wishlist` page offers "Email
me about these" to a guest whose list has items and no address
(`PATCH /wishlist {email}`); an account's list refuses an address of its own,
because its messages go to the account. Each email carries a stop link on
`alerts_token` — never the list's token, which would let anybody who read the
email open and edit the list — landing on `/store/wishlist/stop/{token}`,
which answers one sentence for every token, the cancel link's rule. It stops
the list's emails and nothing else: it is not a newsletter unsubscribe.

**Both emails are in the catalogue** — `wishlist_back_in_stock` and
`wishlist_price_drop`, editable in Settings → Email templates (thirty messages
now) — and `Messenger::notify(WishlistBackInStock|WishlistPriceDrop, …)` is
called beside each, guarded, for the channels stream B adds.

**Where it is seen.** A heart on both store cards and a Wishlist button under
Add to basket on the product page (the product as a whole — somebody saving a
switch has usually not chosen between the ports yet); the count before the
divider in the store strip, which wraps below `lg` for the one 320px case
that does not fit; `/store/wishlist`; the portal's "My wishlist" tab beside
the orders, with the emails switch; and "Most wished for" on the store
dashboard — five products by the number of *lists*, all time, since a wish is
standing demand rather than an event in the window.

## Reviews (2026-09-26)

The client asked for reviews on the shop from five reference screenshots, and
decided four things: **signed-in customers only**, **staff approve every
review**, **no photos** for now, and **a "How was it?" email after delivery**.
The plan is `docs/store-reviews-plan.md`.

**One review per customer per product, and a second write edits the first.**
`product_reviews` is unique on `(store_product_id, customer_id)`;
`POST /store/products/{slug}/reviews` is a portal route (`auth:sanctum` +
`customer`) and uses `firstOrNew`. **Every write goes back to `pending`**, an
edit to a published review included — what staff approved was the text that
was there — and the featured flag goes with it. `published_at` is stamped on
the first publish and never cleared, the `approved_at` rule.

**Verified is a paid order, read on every write.** `ReviewPurchase::for()`
finds a line for the product on one of the customer's `Order::paid()` orders
(the module's one definition, so a COD order verifies once the cash is banked);
`order_id` is kept and the variant label is the line's own snapshot —
`variation_name`, else the options joined "Black / XL" — never the live
variation, which the shop may have renamed. Somebody who reviews first and
buys later is verified on their next edit.

**The body is plain text, stored as typed and rendered escaped**, the blog
comment's rule. The name on a card is a snapshot, "Neil B."
(`ProductReview::displayNameFor`); the public resource carries no customer id,
address or order, structurally.

**The summary lives on the product and follows the review from the review's
own hooks.** `rating_average` (one decimal) and `rating_count` are written only
by `ReviewSummary`, called from `ProductReview`'s `saved` and `deleted` when a
review enters or leaves `published` or a published one changes its stars — so
moderation, an edit sending it back to the queue and a delete all move the
number, and no card ever aggregates per row. It is a base-query update: the
product's `updated_at` is its own editorial change, and model events on the
product have no business firing for a customer's review. Moderation moves rows
**one at a time** for the same reason the comment queue does. The one path that
cannot fire an event is a customer deleted by the foreign key, and nothing
deletes a customer. `rating` on the store product resource is
`{average, count}` or **null** until something is published — "rated 0" is a
claim and "not rated" is the truth.

**The public list is six a page and sorts four ways.** `featured` (the
shop's pick first, then stars, then newest), `newest`, `highest`, `lowest`,
all in `ProductReview::scopeSorted`, every ordering ending on `id`; an unknown
sort falls back to featured, the catalogue's rule. `meta` carries the average,
the count and a distribution with all five keys present.

**The product page stays cacheable.** The first page of reviews is fetched with
the product (`lib/reviews.ts`, tags `store-reviews` and `store-reviews:<slug>`)
and rendered on the server; sorting and Show more go through
`/api/store/reviews`, whose slug, sort and page are an allowlist so the data
cache holds only real entries. Who is writing is asked of
`/api/store/reviews/mine` **when the dialog opens** — no cookie, no API call —
and `?review=1` (the email's link, the portal's) is read by
`useSyncExternalStore` with a false server snapshot, because the ISR render
never sees a query string. The console's moderation calls
`updateTag("store-reviews")` and `updateTag("store-products")`.

**The dialog is `Modal`, and both steps are one `<Form>`.** Step one is the
five stars as radios (44px targets, arrows move the choice, a press moves on,
"Dislike it!" and "Love it!" under the ends); step two is the optional title
and the words with a counter; step three thanks. The first step is hidden,
not unmounted, so the rating is in the submission — the tabbed-form rule. A
signed-out visitor sees "Sign in to write a review" linking to
`/portal/login?return=…`.

**The portal login's `return` is a same-site path or nothing.**
`safeReturnPath()` (`lib/safe-return.ts`) accepts a path that starts with `/`,
not `//`, with no backslash or control character anywhere — browsers read `\`
as `/` and strip tabs and newlines before resolving — and falls back to
`/portal`. It is read by the page (the already-signed-in redirect) and again by
both actions, because the hidden field is a request body.

**The stars are two tokens.** `--color-rating` (a gold) and
`--color-rating-empty` are derived per theme by `ratingFor()` against the card
and surface-2 and emitted with the theme; `npm run themes` holds both at 3:1 on
both grounds, in every palette and scheme. `components/store/stars.tsx` draws a
fraction as the gold clipped over the empty outline.

**Store → Reviews is `role:store_manager`**: waiting by default (`?status=all`
for everything), one decision or fifty through `POST …/moderate`, the featured
switch, a delete behind a confirmation, and `attention.reviews_pending` on the
dashboard linking to it.

**The "How was it?" email is once per order, hourly, inside quiet hours.**
`technoware:request-reviews` asks about orders that are paid, not cancelled or
refunded, have a customer account and have had their goods
`store_review_request_days` (default 7) — from `dispatched_at`, or `paid_at`
when nothing on the order ships. An order that ships and has not been
dispatched is never asked. It is stamped (`review_requested_at`) **before** the
send and whatever happens — a suppressed address, nothing left to review, a
failed send — so it cannot loop; `Notifier` swallows the failure. Outside
`QuietHours::allows()` it does nothing and the orders are still due at nine;
`store_review_requests_enabled` switches it off. The `review_request` template
lists only the products the customer has not reviewed, each linking to
`/store/products/{slug}?review=1`.

## The browser's return is bound to the order, and Razorpay says how much (2026-09-26)

The signature on Razorpay's return is over `order_id|payment_id`, which proves
Razorpay issued the pair — and nothing about which of *our* orders that
Razorpay order was opened for. The return carried no amount either, so
`Settlement` skipped its amount check and recorded the payment at the order's
own total. Paying ₹1 for order A and posting A's signed triple to
`/orders/B/verify` marked B paid.

Three checks now, in `RazorpayProvider::verifyReturn()`:

1. the signature, as before;
2. **the binding** — `createSession()` writes the gateway order id to
   `orders.gateway_order_id` (migration `2026_09_26_100000`), and the return
   must name exactly that one (`hash_equals`). The latest session wins; a
   browser coming back from an older dialog is refused and the webhook
   settles it;
3. **Razorpay's record** — `GET /v1/payments/{id}`, server to server: status
   `captured` or `authorized`, `order_id` the one this order opened, currency
   `INR`, and its `amount` handed to `Settlement`, whose check now runs.

`Settlement::recordReturn()` is what the verify endpoint calls, and it
**refuses** an outcome with no amount instead of recording it at the order's
total. Refused rather than recorded as failed: the payment row is keyed on the
gateway payment id, and a failed row written from a doubtful browser return
would make the genuine webhook for the same payment a no-op. Cashfree already
asked its own API by our order number and used its amount; it now also
requires `INR`. `PaymentTest` pins the cross-order replay, a wrong amount, an
uncaptured payment, a payment against another Razorpay order, another
currency, and a return with no session opened.

## A coupon use is released by cancelling an unpaid order (2026-09-26)

The use is taken at checkout so a single-use code cannot be spent in two tabs
— which left every abandoned order holding a use for ever, and anybody could
exhaust a limited code with orders they never meant to pay for.
`Order::moveTo(Cancelled)` now deletes the order's `coupon_usages` row when
`paid_at` is null; a paid order keeps its use whatever happens to it, because
its discount is part of what was charged. There is no expiry job for unpaid
orders; cancelling from the console is the release.

`POST /cart/coupon` answers an **off, expired or not-yet-started** code exactly
like one that does not exist ("That code is not recognised."), so the endpoint
is not a list of last month's and next month's codes (`Coupon::isLive()`).
What it still says in words — the minimum spend, "fully used", "you have
already used that code" — is about a live code the caller has shown they
know. A code that expires while it sits on a basket still says "That code has
expired." on the basket: that person had it when it worked.

## The activation procedure is not public (2026-09-26)

`store` is a public settings group for the shop's switch and its shipping and
returns figures, and three rows the storefront never reads rode along with it:
`digital_auto_fulfil`, `activation_procedure` and `activation_pdf_path` (with
its derived `_url`) — the steps and the document a buyer is sent *after
paying*. `PublicSettings::PRIVATE_KEYS` names them and `/settings` leaves them
out; the settings screen reads them through the admin endpoint as before.

## The import commit takes a file name, not a path (2026-09-26)

Both import wizards hand the stored path to the browser and take it back on
commit. The check was a prefix, and Flysystem collapses `..`, so
`store-imports/../newsletter-imports/mailbox-3.csv` read another area's
private file (its rows came back in `problems[]`) and deleted it.
`App\Support\ImportUpload::resolve()` keeps only the last segment, requires a
plain file name, and rebuilds the path under the fixed directory — the store
import and the newsletter import both use it.


## Specification filters (2026-09-26)

The client asked for filters **chosen per category from the products' own
spec sheets** — "Ports", "PoE", "Rack units" — rather than a filter builder
with its own vocabulary. `docs/store-merch-plan.md` is the plan.

**The index is derived, and rebuilt whole.** A spec sheet is stored on the
product as ordered pairs (`App\Casts\SpecSheet`) and a variation's options the
same way: JSON, which cannot be indexed for "every product whose Ports is 24
or 48". `store_product_specs` holds one row per product, label and value —
`label`/`value` as typed, `label_key`/`value_key` normalised (trimmed,
whitespace collapsed, lower-cased), a unique index on the triple and an index
on `(label_key, value_key)` — and `App\Support\Store\SpecIndex::rebuild()`
deletes a product's rows and writes them again from what it says now. **A
product matches when any active variation has the value**: a switch sold as a
24-port and a 48-port is one somebody filtering by 48 wants to see, and an
inactive variation cannot be bought, so it offers nothing.

**Rebuilt after the commit, once per product.** The admin form saves the
product and then each variation inside one transaction, and each save asks for
a rebuild; rebuilt on the first ask the index would read the variations before
they were written. `SpecIndex::queue()` defers every ask to `DB::afterCommit`
(at once outside a transaction), and the first callback to run stamps the
product so the rest — all asked before that stamp — skip. The guard is a
timestamp rather than a "pending" set because a rolled-back transaction drops
its callbacks and would leave a set entry standing for the life of a queue
worker. The hooks: a product created or with a changed sheet; a variation
created, deleted, or with changed options or switch; and the admin controller
asks directly after `saveVariations()`, whose removals are a mass delete that
fires no event. `technoware:rebuild-store-specs` rebuilds everything — run it
once after the migration, and after any write that went around the models.
A failed rebuild is reported and never thrown: the `StockLedger` rule.

**OR within a label, AND across, matched on the keys.** `?spec[Ports][]=24
ports&spec[Ports][]=48 ports&spec[PoE][]=Yes` is (24 or 48) and PoE — two
port counts ticked is "either will do", and "24-port and PoE" is one switch
with both (`App\Support\Store\SpecFilter`). **A label nothing in the shop
carries is ignored**, not applied: applied it would empty the page, which is
what a renamed label or a mangled bookmark would do to somebody who did
nothing wrong. A known label with a value nobody has is a real filter and
answers nothing. Twelve labels and forty values a request at most.

**Facets are counted under the other labels' choices, never their own.**
`GET /store/categories/{slug}/facets` answers each of the category's filter
labels with its values and how many published products each would leave.
Counted under its own selection, ticking "24 ports" would put 0 against "48
ports" — which reads as "none" when it means "not ticked yet", and OR within
a label is exactly the choice those numbers are for. A ticked value emptied by
the other choices stays at 0 so it can be unticked. Values are in a natural
order: a leading number as a number ("8 ports" before "24 ports", "1,000
Mbps" as a thousand), numbers before words, then `strnatcasecmp`.

**Only the unfiltered answer is cached** — five minutes, keyed on the category,
its filter list and `updated_at`, the newest product in it and the index's
version (`SpecIndex::touch()`, moved by every rebuild and every product
deleted: the two changes that alter counts without moving any product's
`updated_at`). A selection is counted fresh every time; a combination
somebody ticked is a user's query, the rule `?q=` keeps. The frontend's
`publicApi.storeFacets()` takes the same `cache` flag and the page passes
`false` whenever a spec is in the address — and `storeProducts()` likewise.
A category with no filters answers `data: []` in a 200, the `/menus/*` rule.

**The labels a category offers are chosen from what its products carry.**
`store_categories.filter_specs` is an ordered list of labels, edited on the
category form's Filters tab (`SpecFilterPicker`): chips of every label its
published products carry with how many carry it, most common first, ticked
into a list reordered with `ReorderButtons`. `Store\CategoryRequest::after()`
refuses a label none of the category's products carries and a label twice
(on the key) — **except a label already saved**, which stays saveable after
its last product lost it, so an unrelated edit is never refused over it; the
picker lists it at 0 to take off. A new category has no products and so can
offer no filter yet. The admin detail read carries `spec_labels`; both
category resources carry `filter_specs`.

**`/store` filters; the category page links.** `/store` is dynamic already, so
its panel is a GET form through `AutoApplyForm` — a tick applies at once and
pushes the address the form would have submitted — beside the grid from `lg`
(which drops to four columns) and a disclosure above it below `lg`
(`SpecFilterDisclosure`: a button with `aria-expanded` and the `hidden`
*class*, because a closed `<details>` cannot be opened again by a breakpoint).
Chosen values are chips over the grid, each removing itself, with "Clear all".
`/store/categories/[slug]` is ISR and **must not read `searchParams`** — a
request-time API in that render is a 500, not a fallback — so its panel is
built from the cached unfiltered counts and every value is a link to
`/store?category=<slug>&spec[..]`: `nofollow` (a filtered view is
`noindex, follow` through `listingMetadata`, where `spec` is a filter) and
`prefetch={false}` (forty prefetched dynamic renders per category page is
forty renders nobody asked for).

**The address is indexed, `spec[Label][i]`, not `spec[Label][]`.** Every pair
is then its own key, so `Pagination`'s flat `params`, the chips' links and the
filter bar's hidden inputs can all carry a selection (`lib/store-specs.ts`);
PHP reads both forms the same. The filter bar keeps the selection through a
change of sort (`keep`, hidden inputs); **only the labels the chosen category
offers narrow the listing**, so a selection carried across a change of
category is ignored unless the new category offers the same label, in which
case its panel shows it ticked. A label containing `[` or `]` does not survive
PHP's bracket parsing — none in this catalogue does.

## Product video and zoom (2026-09-26)

**Videos are YouTube links and uploaded MP4/WebM files, up to four.**
`store_products.videos` is a list of `{kind, youtube_id | path, title,
poster_path}` (`App\Support\Store\ProductVideos`, a plain `array` cast — a list
keeps its order in MySQL, object keys inside it do not, and nothing reads
them in order). **A YouTube link is stored as its id**: validated through
`YouTube::id()`, which compares the host exactly and so refuses
`youtube.com.attacker.test`, and normalised in the controller so the link
itself is never written. **A file is a media-library path with a video
extension** the library holds; a PDF, an unknown path or a URL is refused. A
poster is a JPEG, PNG, WebP or GIF from the library — not an SVG, since a
poster is a frame. `StoreProductVideoTest` pins each refusal.

**The console edits them on the Media tab** (`VideoField`): a row per video —
a YouTube link or a file chosen through `MediaBrowser` (the Files half, which
holds video), a title, a poster — reordered and removed with `ReorderButtons`,
posted as one hidden JSON list and replaced wholesale. `videos` is in the
Media tab's `fields` list, or a refused link would be charged to Content.

**On the page they follow the pictures** in `ProductGallery`, whose shop-only
behaviour is behind `store` — the catalogue's product page passes nothing and
is unchanged. A video's thumbnail is its poster or a drawn panel with a play
mark; in the well a YouTube video is **the click-to-play facade**
(`ProductVideoPlayer`): the uploaded poster or the brand panel, and
`youtube-nocookie.com` mounted on the press with `autoplay`. **Never
`i.ytimg.com`** — YouTube's thumbnail would be the third-party request the
facade exists to avoid, and it is not in `img-src`. A file is `<video controls
preload="none" playsInline poster>`; `media-src` now names the asset origins,
so a file from the API's storage is not a report-only violation (a slider's
uploaded video benefits too). A video's well is a `div`, not the lightbox's
button — a player inside a button is two controls fighting over one press —
and is keyed on the slot, so moving between two videos starts each at its
facade. The store also shows **every** picture's thumbnail in a strip that
scrolls past five (`w-0 min-w-full`, the grid-item rule), where the catalogue
still shows the first five.

**The hover magnifier is `scale` and a following `transform-origin`.** In the
store's well, from `lg` on a device that hovers with a fine pointer (asked of
`matchMedia` on each entry, so a resized window behaves), the picture scales
to 2× inside the well with its origin under the pointer. Written to the
`<img>`'s style directly rather than through state — sixty renders a second of
the whole gallery otherwise — and transitioned as `transition-[scale]`, never
`transition-transform` (the Tailwind v4 trap); the global reduced-motion rule
removes the transition and keeps the zoom. The well stays the lightbox's
button, and a click resets the magnifier first.

**The lightbox zooms 1× to 3× and pans** (`components/ui/gallery.tsx`, so a
CMS gallery's lightbox gains it too). A click zooms to 2× at the point pressed
and a second click puts it back (the second press of a double-click is
ignored, so a double-click zooms in); `+`/`=`, `-` and `0` on the dialog;
Ctrl + wheel, which is also a trackpad's pinch, through a non-passive listener
(React's `onWheel` is passive and cannot stop the page zooming instead); a
two-finger pinch on touch; drag to pan under pointer capture, clamped so the
picture's edge never comes away from the frame. Zoom holds the point under the
pointer still — `t' = (q − c) − (s'/s)(q − c − t)`, since `scale` then
`translate` place a point at `c + s(p − c) + t`. Zoom and pan live in the
lightbox and `go()` resets both, so every way of moving to another picture —
arrows, keys, a thumbnail, the slideshow — arrives whole. The zoomed picture
asks for a `200vw` variant. "Zoom in", "Zoom out" and "Reset zoom" are
labelled controls in the top bar, disabled at the ends, and a polite live
region says the percentage.

**`subjectOf` names a YouTube video only when every required property is
honest.** Google requires `name`, `thumbnailUrl` and `uploadDate` for a
`VideoObject`. The name is the video's title or the product's; the thumbnail
is **the uploaded poster and nothing else** — YouTube's own frame is never
requested by this site and is not claimed — so a video without a poster is
left out of the graph; `uploadDate` is the product's `updated_at`, the page
carrying it (the video's own publication date is YouTube's, and not something
this application knows); `embedUrl` is the nocookie player the page mounts.
Uploaded files are drawn on the page and left out of the graph, per the plan.

## The Meta catalogue: Facebook, Instagram and WhatsApp (2026-09-26)

**One source, two sinks.** Meta's Commerce Manager — which also stocks the
WhatsApp Business catalogue — reads a scheduled data feed, and accepts
Google's RSS format. `/meta-catalogue.xml` and `/meta-catalogue.csv` are built
from the same rows as the Google feed (`GET /api/v1/store/feed`,
`ProductFeed::build`), mapped at the frontend sink in `lib/meta-catalogue.ts`:
so what is listed, each item's id, which price is the regular one and which
the sale, and whether a shelf is in stock cannot differ between the two
platforms, which suspend accounts over the same mismatches.

**What the mapping changes.** `availability` in Meta's words — `in stock`,
`out of stock`, and **`available for order` for a back-order**, which is what
an empty shelf the shop has agreed to take orders for is. Google-only
attributes (`identifier_exists`, the shipping block, handling times,
`product_detail`) are left out. `size` and `color` come from the variation
options the Google feed already maps. **No `quantity_to_sell_on_facebook`**:
no stock count is ever published. A product the Google feed leaves out —
withheld, a service, no raster picture — is left out of both. A product with
no brand is sent without one; Meta reports it rather than being told an
invented one.

**Each format is escaped at its own sink**: XML text escaping in the XML, and
in the CSV RFC 4180 quoting plus the formula guard `Csv::escape` keeps on the
API side (a cell opening `=`, `+`, `-`, `@`, a tab or a carriage return gains
an apostrophe). Several additional pictures share one CSV cell,
comma-separated, which is Meta's form. Both are cached for an hour and fail
the Google feed's way — an empty feed, never a 500.

**`meta_catalogue_enabled`** (`store` group, public, on by default — it
publishes nothing the Google feed does not) switches both routes to a 404.
The store products screen's feed card (`StoreFeedsCard`) lists the Google
address, both Meta addresses and the catalogue export, each with a copy
button and a plain `<a download>` (never a `Link`: it would prefetch a route
handler that builds the whole feed), and a "How to connect" disclosure:
Commerce Manager → Data sources → Data feed → Scheduled feed; WhatsApp
Business Manager → Catalogue → connect the same catalogue.

## Add to basket on one line (2026-09-28)

Every Add to basket in a row of product cards sits on one line, in every theme (the client, 2026-09-28): the actions row is the card's last part with `mt-auto` (it used to be the price, and a wrapped discount badge moved the button); a theme that lays the card out itself stretches the body to the row's height (Editorial, and Datacenter's column) and never sets a `margin-top` on `[data-tile-actions]`. `scripts/probes/store-cart-level.mjs` measures all twelve themes.

## A store manager can open a shop product (0.130.0)

The shop product's edit and new screens load the brand list from
`GET /admin/brands`, a `role:content_manager` route — so an account holding
**only** `store_manager` got a 403 inside `Promise.all` and the screen was an
error boundary, for exactly the role the screen belongs to. Found by opening
the form as a throwaway store manager to check the Sections tab's note; no
audit signs in as one.

Both pages now catch **a 403 and nothing else** on that one read
(`getBrandOptions().catch(...)`, the shape `getPageBuilderOptionsIfAllowed`
has) and hand the form an empty list. The form then offers the product's own
brand (`brand_id` + `brand_name` from the admin read) so the select still
holds it and a save cannot clear it — the rule the services picker beside it
already followed — and says under the box that the full list needs the
Content manager role. A new product made by that account has no brand until
somebody with the list sets one.

The API was not widened: the brand list stays a content manager's. Checked
by saving the form as that account and reading `brand_id` back unchanged.

## Returns (0.132.0)

A customer asks to send delivered goods back; the desk approves or declines,
marks the goods received — putting what is fit to sell back in stock — and
records the refund. Three tables (`order_returns`, `order_return_items`,
`order_return_photos`), one status enum and one class that moves it.

**A return is a request about lines of one order, never a new kind of
order.** `order_return_items` points at `order_items` with a quantity, so the
name, SKU and price a return shows are the order line's own snapshot — a
product renamed or deleted since still reads as what was bought. The
reference is `RMA-YYYY-NNNNN` under `return_reference_prefix`
(`References::returns()`, the ticket prefix's rules), and the console binds
`{order_return}` by it.

**`ReturnPolicy` is the one answer to "may this come back".** Four things,
all read from what the shop already records:

- the switch — `store_returns_enabled`, on by default. Off, the order page
  says to get in touch and the endpoint refuses;
- the order — dispatched or completed, not cancelled or refunded;
- the window — `store_return_days` (the setting the Merchant Center feed and
  the product page already read, so the promise made before the sale is the
  one kept after it) counted from `completed_at`, or from `dispatched_at`
  plus the longest transit time while nobody has marked it delivered, to the
  **end of that day**;
- the line — shipped (a licence key or a service has nothing to send back)
  and `returnable` on the order line, less what other returns of the order
  already hold. A **rejected** return holds nothing, so the customer may ask
  again; every other status does, a closed one included.

`describe()` is what the customer's order resource carries as
`return_policy`: `open`, the one sentence to show when it is not, the last
day in the API's words, and how many of each line are left. The frontend
works none of it out.

**`ReturnActions` is the only place a return moves.** The request (from the
order link or the portal — two routes, one method) locks the **order** row,
so two tabs asking for the same last unit are settled in turn. Each desk
move locks the **return** row and re-reads its status before `canTransitionTo()`,
so two presses of "Mark as received" restock once — the control run removing
that check fails two of `ReturnsTest`'s cases by name. Every move writes a line on the
**order's** trail, which is where somebody reading the order later looks.

| From | May become |
|---|---|
| requested | approved, rejected, closed |
| approved | received, closed |
| received | refunded, closed |
| rejected | approved |
| refunded, closed | — |

**Receiving is where stock comes back, and only when somebody says so.** The
desk enters how many of each line arrived and ticks the ones fit to sell;
a line not ticked is not restocked, because putting stock back is a
judgement about the condition of what came back. A restock is a
`StockLedger::record()` with `StockMovementReason::Return` and the return's
reference as its note, written on the affected row count like every other
movement, to the variation when the line was one. A product deleted since,
or one that does not track stock, has no shelf and takes nothing.

**A refund is `ManualRefund`, linked to the return.** Nothing calls a
gateway; the desk records the amount and the reference of money already sent
back, and `ManualRefund` keeps its own rules (never more than was paid less
what has gone back; the amount completing it moves the *order* to
`refunded`). The form starts on the price of what arrived
(`suggestedRefundPaise()`), with no share of an order-level discount taken
off — the refusal names what is left when that is too much. An unpaid order
(cash on delivery, refused at the door) has nothing to refund: the panel
says so and the return is closed instead. **Close** is the way out for a
return that ended some other way, and mails nobody.

**Photographs are the third unauthenticated upload**, after the CV and a
form's file field, and follow their rules: private disk
(`returns/{return id}/`), hashed names, extension **and** content checked
(jpg, png, webp), four at most, 5 MB each, stored last inside the
transaction so a refused request leaves no file. No address anywhere — the
customer's resource carries `photos_count` only, and staff read one through
`GET /admin/store/returns/{reference}/photos/{id}`, always as an attachment.
Deleting a return (only the order's cascade does) removes its folder through
the model's `deleting` hook.

**Six emails, one class for the customer's five.** `ReturnStatusChanged($return, $key)`
is `return_requested`, `return_approved` (with `store_return_instructions`,
plain text, and the desk's own message), `return_rejected` (the reason),
`return_goods_received` and `return_refunded` (the amount and reference);
`ReturnRequestReceived` goes to `support_email`. All through `Notifier`,
after the commit, all editable under Email templates. The `return.requested`
webhook carries the admin resource less `staff_note`.

**On the page.** `ReturnsSection` (`components/store/`) is drawn on both the
guest's order page and the portal's: the order's returns with a `Stepper`,
then the form inside a closed `<details>` — most people opening an order are
not returning it. Nothing is drawn for an order that has not left yet. The
form posts through a Server Action until a photograph is attached, then
`useUploadForm` sends multipart to a route handler. **The guest's handler
lives at `/order/{n}/returns`, under the order's own path**, because the
order's token cookie is scoped to `/order/{n}` and would not be sent to
`/api/…`; the portal's is `/api/portal/orders/{n}/returns`. One map,
`RETURN_TONE`, colours the status badge on the customer's page and both
console screens.

**The console.** Store → Returns (`role:store_manager`) lists what is
waiting first, oldest first. A return's screen draws a panel per move the
API's `allowed_next` offers and nothing else; each success redirects with
`?done=return-…`, because the panel that was pressed is gone by then. The
store overview's attention strip counts `returns_requested`, and an order's
own screen lists its returns.

**Not built, on purpose**: return shipping labels or courier pick-up,
exchanges as a transaction (close the return and place the replacement
order), store credit, and a restocking fee — the desk types the amount it
actually sent back.

`ReturnsTest` (22). `scripts/probes/returns.mjs` drives the whole path
through the real screens.

## Zoho Books invoices (0.134.0)

Optional and off by default. Connected, each order's GST invoice is made in
the client's own Zoho Books and its PDF is stored where an uploaded invoice
always was — so the customer's order page, the portal and the console's
download needed no change. Switched off, or never connected, nothing here
runs and the invoice is uploaded by hand as before.

**The invoice lives in Zoho; this application keeps a pointer and a copy.**
`orders.zoho_invoice_id` is the pointer, `invoice_number` / `invoice_date`
are Zoho's own, and the PDF is `orders/{order_number}/zoho-{id}.pdf` on the
private disk at `invoice_path`. Numbering, the GST split and the books are
Zoho's — which is the reason for the integration at all: an invoice
generated here would be a second numbering series beside the accountant's.

### The connection

`OAuthConnection::zohoBooks()`, a slot of its own (`zoho_books_oauth_*`), on
a new `OAuthProvider::Zoho`. Zoho's accounts and API hosts differ per data
centre — `accounts.zoho.in` and `www.zohoapis.in` for India, `.com` for the
US — so `zoho_books_dc` is read when the consent URL is built and on every
call; a client registered at one data centre is refused at the other, which
is the first thing to check when Connect fails. The client is a
**Server-based Application** from the Zoho API Console. Scopes:
`ZohoBooks.invoices.CREATE,READ,UPDATE`, `ZohoBooks.contacts.CREATE,READ`,
`ZohoBooks.settings.READ` — nothing that can delete, and nothing outside
Books. `access_type=offline` and `prompt=consent`, for the reason Google's
needs them: no refresh token otherwise.

The callback is `/admin/store/settings/zoho/callback`, checked exactly by
`CallbackPath::assert()` like every other connection's — a consent started
for Zoho cannot be finished on another slot's path, or the reverse.

**Three choices only Zoho can list**, read when the settings tab opens: the
organisation (`GET /organizations`; a single one is chosen automatically on
connecting) and the two taxes (`GET /settings/taxes`, groups included). They
are stored as Zoho's ids and checked for shape only — digits. The home state
is ours: `IndianStates`, Zoho's two-letter codes.

`ZohoSettings::ready()` is the one answer to "will an invoice be made": the
switch, a connected account, an organisation, a home state and both taxes.
`missing()` lists what is not there yet, in the order somebody would do it,
and the settings panel, the test button and a refused manual press all quote
it.

### When, and exactly once

`ZohoInvoices::consider()` runs from the order's own `updated` hook when
`status` or `paid_at` changes. `due()` is the rule: with **When dispatched**
(the default) an order with something to ship is due at `dispatched_at` and
one with nothing to ship — a licence, a service — at `paid_at`; with **When
paid**, every order at `paid_at`. Never while the order is waiting for an
online payment, cancelled or refunded. A cash-on-delivery order under "When
dispatched" is invoiced at dispatch, unpaid, which is correct: the invoice
goes in the box.

**One invoice per order, however often it is tried**, held three ways
because there are three ways to get two:

- `zoho_status` (null → `pending` → `creating` → `created` | `failed` |
  `skipped`) is claimed with a conditional UPDATE, so the queued job, the
  five-minute sweeper and a press of the button cannot both be making it. A
  `creating` claim older than ten minutes was abandoned and may be retaken.
- Before creating, Zoho is asked for an invoice whose `reference_number` is
  this order's number, and one that exists is **adopted**. A crash between
  "Zoho made it" and "we wrote that down" therefore finishes on the next
  attempt instead of repeating. The id is written to the order the moment
  Zoho returns it, before the invoice is marked sent or the PDF fetched.
- An order that already has an uploaded invoice is `skipped`.

`consider()` swallows everything: a dispatch that is saved is not undone
because an accounts system is down — `Notifier`'s rule. Writes go through
the query builder (`finish()`), because this runs inside the order's own
hook and a model save there would re-enter it.

A refusal is retried by `technoware:sync-zoho-invoices` (every five minutes)
after 5, 30, 120 and 720 minutes — five attempts, then it is a person's.
`zoho_error` holds Zoho's own words (they name the field), the order's screen
shows them with **Try again now**, `attention.zoho_failed` puts a tile on the
store overview, and `?zoho=failed` is the list behind it. A manual press
ignores the attempt count. A 401/403 also writes `zoho_books_error`, the
`mail_error` pattern, shown on the settings tab and cleared by a success.

### What the invoice says

- **Prices include GST**, so `is_inclusive_tax: true` and each line's rate is
  the price the customer saw. A coupon is one `entity_level` discount with
  `is_discount_before_tax` — how the checkout extracted the GST. Rupees are
  made from integer paise at the last moment.
- **One tax per invoice**: the intra-state tax (the CGST+SGST group) when the
  place of supply is the home state, the inter-state one (IGST) otherwise.
  Place of supply is the delivery address's state, else the billing one;
  `IndianStates::code()` reads a name or a code in any case, and an address
  it cannot place sends no `place_of_supply` and takes the intra-state tax —
  Zoho then applies the contact's own.
- **The customer** is found by email (`GET /contacts?email=`) and reused **as
  it is** — an existing contact's address and GSTIN are the accountant's and
  are not overwritten. Otherwise one is created from the order: the company
  as the name when there is one, the GSTIN and `business_gst` when given,
  `consumer` otherwise. Zoho wants display names unique, so a clash is
  retried once with the email address appended.
- **The date** is the day the sale became invoiceable (`dispatched_at` or
  `paid_at`), never the day a retry happened to succeed.
- The invoice is **marked sent**, so it is a receivable rather than a draft.
  Zoho does not email it: the customer gets it from their order.
- When Zoho's total differs from the order's by more than a rupee — a tax of
  the wrong rate chosen in settings, usually — the order's history says so.
  The invoice is still made: hiding the difference would be worse.

### What it does not do

- **Payments and credit notes were not sent in 0.134.0.** They are since
  0.136.0 — see "Zoho Books: payments and credit notes" below. Gateway fees
  still are not.
- Orders from before the switch was turned on are not back-filled; the
  button on an order makes one.
- One GST rate, the shop's own (`Money::GST_BASIS_POINTS`). There is no
  per-product tax or HSN code to send.

**Not driven against a real Zoho account.** `ZohoBooksTest` (25) fakes
Zoho's HTTP: the request shapes are from Zoho's published API and a first
connection may still surface a field it wants differently — its refusal is
shown in its own words on the order, which is what that screen is for.
`scripts/probes/zoho-books.mjs` drives the console side: the settings tab,
the callback page's three answers, and the order panel in each state.

## Zoho Books: payments and credit notes (0.136.0)

The client, 2026-10-08: "payments and credit notes need to sent to Zoho".
Every row in `payments` that says money moved is told to Zoho once: a `paid`
row becomes a **customer payment** applied to the order's invoice, a
`refunded` row a **credit note** against it.

`App\Support\Store\Zoho\ZohoPayments` is `ZohoInvoices` again on a different
row, and reads the same way:

- **State is on the payment row** (`2026_10_09_100000`): `zoho_status`
  (`pending`, `sending`, `sent`, `failed`, `skipped`), `zoho_id` (the
  customer payment's id, or the credit note's), `zoho_number` (the credit
  note's number), `zoho_refund_id`, attempts, error, claim and next-attempt
  times. Claimed by a conditional UPDATE; written through the query builder.
- **Called from two places.** `Payment::created` → `consider()`, and the end
  of `ZohoInvoices::create()` → `forOrder()`. A payment needs its order's
  invoice to exist in Zoho, and a card order is paid before it is dispatched
  — so the usual case is the payment waiting, unmarked, and following the
  invoice the moment it is made. `consider()` never throws.
- **`ZohoSettings::paymentsReady($method)`** is the one answer to "may this be
  sent": invoices ready, `zoho_books_send_payments` on, the consent current,
  and an account chosen for the order's way of paying
  (`zoho_books_account_{gateway,cod,bank_transfer,upi}`). None of it is part
  of `missing()` — an invoice needs none of it, and `paymentsMissing()` is a
  separate list the tab shows.
- **A way of paying with no account is not sent, and not marked.** The row
  stays null, so choosing the account later sends it: the sweep looks for
  unmarked rows on invoiced orders, narrowed **in SQL** to the ways of
  paying that have an account, or rows that can never be sent would fill the
  window and starve the ones that can.
- **Once.** The reference Zoho is given — `{order}-P{payment id}` or
  `{order}-R{payment id}` — is asked for before anything is created, and
  what Zoho made is written to the row before the next call, so a retry
  resumes at the step that failed (`test_a_half_finished_credit_note_is_resumed_not_made_again`).
- **Zoho's books are the truth about Zoho.** What is still owed on the
  invoice and what of a credit note is unused are read from Zoho each time,
  never remembered. An invoice with nothing owed means somebody recorded the
  payment there by hand: the row becomes `skipped` and the order's trail says
  so, rather than leaving the customer in credit.
- **A credit note says what it can** (`creditNotePayload()`): the invoice's
  own lines and discount when the whole order is refunded in one go; the
  received items when the refund is linked to a return
  (`order_returns.refund_payment_id`) and they add up to exactly the amount
  on an undiscounted order; otherwise one line, "Refund — order N", for the
  amount, taxed as the order was. Never an invented item list.
- **Then it is used as Zoho's balances say**: set against whatever is still
  owed on the invoice, and anything beyond that paid back out of the account
  the money went into (`refundCreditNote`). The usual case — invoice paid,
  money returned — is all refund; an invoice Zoho never took the payment for
  is all applied.
- **The money in before the money out.** A refund first sends any earlier
  paid row on the order that has not reached Zoho, so the invoice is paid
  there before a credit note is set against it.
- **The consent grew**, and `ZohoSettings::SCOPE_VERSION` (2) records which
  one a connection holds: `customerpayments` and `creditnotes` create/read,
  and `accountants.READ` for the chart of accounts. The callback stamps
  `zoho_books_scope_version`; a connection from before it is not asked for
  payments at all, the tab says "Connect Zoho again", and invoices carry on.
- **The tab** (`ZohoBooksPanel`) draws one select per way of paying from
  Zoho's bank, cash and other-current-asset accounts, with a blank first
  option — the 0.134.0 lesson — and the keys are in `HIDDEN`. Unconnected,
  none is drawn or posted. `zoho_books_send_payments` is an ordinary boolean
  row, so it is a switch.
- **On an order**, `ZohoPaymentLine` under each payment says where it stands,
  and `POST …/orders/{n}/payments/{id}/zoho` (`role:store_manager`) sends one
  on request. `Order::scopeZohoFailed()` is the one definition behind
  `attention.zoho_failed` and `?zoho=failed`: a refused invoice **or** a
  refused payment or credit note.
- Retries are the invoice's own schedule, swept by the same
  `technoware:sync-zoho-invoices`.

Not done, and said to the client: gateway fees are not recorded. Imported
WooCommerce orders have no Zoho invoice, so nothing of theirs is sent.

**Not driven against a real Zoho account.** `ZohoPaymentsTest` (17) runs on
`tests/Support/FakesZohoBooks`, the fake both Zoho tests share, which keeps
the invoice's balance and each credit note's because the code reads them
back. The two things most likely to need a correction on a first real run are
Zoho's names for a payment mode (`cash`, `banktransfer`, `creditcard`,
`others` are sent) and which fields an Indian GST organisation requires on a
credit note; either refusal arrives in Zoho's own words on the payment's
line.

One trap found in the probe's first screenshot, and it is not about Zoho: the home state has no
default, and the generic settings select starts on its first option — so the
tab showed "Andaman and Nicobar Islands" and a save from any tab would have
stored it. The panel draws that select itself, with a blank first option.

## Product videos row (0.140.0)

"Shop the videos": the videos already on shop products (`store_products.videos`,
up to four each, a YouTube link or a library file — `ProductVideos`) drawn as a
scroll-snap row of tiles, each a video well with the product under it (picture,
name, SKU, price, the cart button) and the video's title beneath. There is no
second list of videos.

**One definition of the list.** `App\Support\Store\VideoShelf` feeds both
`GET /store/videos` and the page builder's `product_videos` section
(`SectionPresenter::productVideos()`), so the shop front, the homepage, a
builder page and a product page cannot disagree. Published products only
(the tail query as well as the head — a draft's video is in neither); a row is
`{id, video, product}` where `product` is the shop's *list* `ProductResource`
(resolved against a bare request, because a builder page's route is
`pages.show` and would read as a detail view) — so no stock count, no
description, and the video carries a file's public URL but never its path.
`?limit=` (1–24, default `store_videos_limit`), `?category=<slug>`,
`?order=newest|featured`, `?product=<slug>`: that product's own videos first,
each its own tile, then its category-mates, then the rest — one tile per
product, and the product itself excluded from the tail. `?others=0` returns
only the head: the website sends it when `store_videos_product_others` is off,
so the setting is read once, there.

**Settings.** Public group `store_videos` (eleven rows, `SettingsSeeder`),
edited at Store → Product videos (`/admin/store/videos`) through
`PATCH /admin/store/videos` (`VideoSettingsController`, `role:store_manager`):
the promo band's door — any key outside `KEYS` is refused by name, switches are
`0`/`1`, shape and order are held to `VideoShelf::SHAPES`/`ORDERS` (sent as
`options`), the count is 4–24, the heading 80 and the line 200 characters.
`meta.products_with_video` says what the shelf will draw from. The shop front
and the product page ship **on**; a shelf with no rows renders nothing at all,
so an install without product videos is unchanged and one with them gains the
row (one switch each turns it off). The homepage ships off and the autoplay
switch ships off.

**Playing.** The default is a facade: the poster (the video's, else the
product's first picture, else a panel this site draws) and `PlayDisc`; a press
mounts the `youtube-nocookie.com` iframe (`YouTubeFrame` in
`product-video.tsx`, shared with the gallery's player) or a `<video>`. Nothing
is requested from any YouTube host before that press and **never
`i.ytimg.com`** (not in `img-src`, and the privacy rule). One tile plays at a
time — "which tile is active" is a module-level store read with
`useSyncExternalStore`, so a second shelf on the page shares it. Autoplay
(`store_videos_autoplay`) mounts a muted, looping, control-less player in a
tile at least 60% on screen, at most four, and unmounts it on leaving; it is
off under reduced motion and Save-Data (`navigator.connection.saveData`), and
where the cookie banner is in use (`cookie_consent_enabled` and an analytics id
— the layout's own condition, `videoShelfConfig().consentGated`) it waits for
`useConsent() === "granted"`, because it contacts YouTube without a press. A
visible **Pause videos** button unmounts every autoplaying player; a press on a
tile gives it the full player with sound. No YouTube script API: iframes only.

**Placements.** The shop front (`/store`, after Top Picks and before the promo
band); the product page's small "Watch" row (`size="small"`, top of the left
column's second row) — which stays ISR-cached because its read is
`publicApi.storeVideos()`, a cached fetch tagged `store-products` and
`store-videos`, and autoplay/consent are decided in the browser; the homepage
(`videos` in `HOME_SECTIONS`, entered through `homeBlockSections()` via
`blocks.videos`, so all twelve themes have it with no template changed); and
the builder's "Product videos" section (`category_id`, `limit`, `shape`).
`CompactAdd` takes `inline` for the tile's strip — the same code as the card's
corner button. Shop product save/delete/bulk actions and the settings action
`updateTag("store-videos")`.

**Why a tile's picture is not YouTube's thumbnail:** fetching it is a request
to a Google host before any press. Give the video a poster (a tall 9:16 one
looks best); without one the product's first picture stands in.

Demo: `SampleProductVideoSeeder` (create-only, first three published shop
products, only while none has a video). Tests: `StoreVideosTest`. Probe:
`web/scripts/probes/store-videos.mjs` (the nothing-before-a-press rule, one at
a time, the cart button, autoplay and Pause).

## Tags (0.141.0)

A row of small coloured pills under the shop's search bar (2026-10-09, the
client): collected on the product form, tidied on Store → Tags, and created
"intelligently" — a product with none is tagged once by a rule, and a button
asks the AI assistant for more.

**Tables.** `store_tags` (`name` ≤ 32, `slug` unique, `is_visible`,
`sort_order`) and `store_product_tag` (unique pair, both cascade).
`store_products.tags_set_at` and `tags_auto` — the second is not in the plan:
it is what the form's "Added automatically" line is drawn from, and it needs a
column because "are these the rule's tags, untouched" cannot be worked out
from the tags alone (the rule's output changes with the catalogue).
`StoreTag` is in the morph map (the Tags screen binds it).

**`App\Support\Store\Tags` is the one implementation** — the product
controller, the CSV import, the WordPress step, the seeder and the Tags
screen's button all call it. `sync()`, `suggestByRules()`, `autoTag()`,
`autoTagUntagged()`, `merge()`.

- **A slug is the identity.** `Str::slug`, so "Wi-Fi 6", "wi-fi  6" and
  "WI-FI 6" are one tag; the first spelling seen is kept as its name. A name
  whose slug is empty (`!!!`) is no tag and is refused on the form (422 on
  `tags.N`), dropped by the importers. Twelve a product (422 on `tags`),
  thirty-two characters a name.
- **The automatic rule runs once.** `tags_set_at` is stamped the first time
  tags are decided: by a request that sends `tags` (even `[]`) or by the rule
  applying some. `autoTag()` runs only while it is null, the product has no
  tags and `store_tags_auto` is on (the Tags screen's button passes `force`: an
  explicit press ignores the switch, never the stamp). **A product the rule
  found nothing for is not stamped** — nothing was decided, and the rule may
  try again once a brand or a category exists. The stamp is written through
  the query builder, not `save()`, so it fires none of the product's hooks
  (the spec index, the price-drop watch, IndexNow) and does not move
  `updated_at`.
- **The rule's output**: the brand, the category, `Digital` for a licence or
  a download, and the values of the specifications the category already
  offers as filters (`filter_specs`, the first four, matched on
  `SpecIndex::key()` so "ports" finds "Ports") — a bare number takes its label
  ("24 Ports"), yes/no values are skipped, nothing over 24 characters, six at
  most.
- **It never fails a save.** `autoTag()` is guarded and logs at `warning`; the
  controller calls it after the transaction.
- **The form does not "decide" by merely being saved.** The product form
  always draws a Tags field, so a form that posted its untouched, empty list
  would stamp every new product and the rule would never run. The field posts
  `tags_changed` (`0`/`1`) beside the list and the Server Action sends `tags`
  only when it is `1`. Saving the rule's tags exactly as they were keeps them
  "automatic".
- **Merge** moves the source's products onto the target with the target's
  existing rows excluded (a product holding both ends with one row) and
  deletes the source, in one transaction.

**Public.** `GET /store/tags?category=&limit=` — visible tags carried by
**published** products (of that category), each with `count`; curated tags
(`sort_order` above 0) first, then the most used, then name; `{data: []}` in a
200 when none or when `store_tags_enabled` is off (the `/menus/*` lesson).
New tags are made with `sort_order` 0, and the Tags screen's arrows place
*every* tag (1..n), so the row is "the screen's order, then most used" without
a hand-kept number. `GET /store/products?tag=<slug>` filters (a hidden tag
still filters — the Shown switch decides what the row offers, not what a link
finds); `?q=` also matches a tag's name. Rows and the detail carry
`tags[{name, slug}]`, visible ones only. The website's `publicApi.storeTags()`
is tagged `store-products` + `store-tags`; the product save and every Tags
action purge them.

**Settings** are the public `store_tags` group (`store_tags_enabled`,
`store_tags_limit` 4–30, `store_tags_auto`) in `STANDALONE_GROUPS` — edited on
Store → Tags through `PATCH /admin/store/tags/settings`, which refuses any
other key by name (the promo band's door). `PATCH /admin/settings` still
accepts them for an administrator.

**Suggest** (`POST /admin/store/products/tag-suggest`, `role:store_manager`,
10/min): `App\Support\Seo\Ai\ProductTags`, the `AltText` shape. It shares the
SEO assistant's switch, key, model, daily cap and counter. The product's words
go inside a `---PRODUCT---` fence (marker stripped until none is left), the
model is shown the shop's existing tag names and told to reuse them, and every
answer is tidied: one to three words, 24 characters, no currency, `%`, `#` or
claim word ("best", "cheapest", "50% off"), one per slug, eight at most.
Anything that cannot be used — off, no key, cap, a silent provider, an answer
with nothing usable — falls back to the rule, and `source` says which
answered. Nothing is saved; tags the product already has are not offered.

**Website.** The row is drawn **only once a category is chosen** — on a
category page, or on `/store?category=…` — never on the bare shop front (the
client's call, 2026-10-10: the front is browsed by category first). A
product page's own chips link to `/store?category=<its category>&tag=…`, so
they land where the row is. `components/store/tag-row.tsx` is a *sibling* of `StoreFilterBar`,
not part of it — the strip must stay a direct child of the shop wrapper to keep
sticking. Every chip links to `/store`: the category pages are ISR and must not
read `searchParams`, so a chip there opens `/store?category=…&tag=…`. The
colour is `tagIndex(slug)` (`lib/tag-colour.ts`, shared with the blog's
category chips) into `--color-tag-fill-N` under white — a hash, never random,
so a tag is one colour on every page and the server's HTML and the browser's
agree. Phone: one scrolling line (`w-0 min-w-full overflow-x-auto`); `sm`
and up: centred, wrapping. Chips are 26px (the tap-target floor is 24) at
12px. A tag-filtered `/store` is `noindex, follow`.

**CSV.** A `tags` column, last, `;`-separated; a blank cell leaves a product's
tags alone, a filled one replaces them, a name a tag cannot be (over 32
characters, no letter or number) refuses the line. A line with no tags cell
goes through the rule. **WordPress**: a WooCommerce product's `tags` come
across (entities decoded); only a name that cannot be kept is warned about.

`StoreTagsTest` pins all of it; the once-only rule, the published-only count
and the twelve-tag cap were each control-run. Not built: tags on the marketing
catalogue, tags as a menu item, tag pictures.

### Tag pages (0.157.0)

A tag is also a page, `/store/tags/{slug}` (the client's decision, 2026-10-10,
reversing the earlier "no landing page per tag").

- **The record.** `store_tags` gains `heading` (160) and `intro` (rich text,
  named in `TagRequest::richTextFields()` or it would bypass the sanitiser);
  `StoreTag` is `HasSeo` (`store_tag` was already in the morph map), so the
  page has the SEO panel, a score and a row on `/admin/seo` ("Store tags",
  `SeoController::ENTITIES`, depth 60 words).
- **The read.** `GET /store/tags/{slug}` answers `{name, slug, heading, intro,
  count, indexable, updated_at, seo, schema}`: 404 for a hidden tag, an
  unknown slug **and while `store_tags_enabled` is off** (the feature is the
  row *and* the pages); a tag nothing published carries answers with `count: 0`.
  `count` is published products only. `schema` is a `CollectionPage`
  (`StructuredData::storeTag`).
- **Indexing: three or more published products** (`StoreTag::MIN_INDEXABLE`).
  Under it the website sets `robots: noindex, follow` (unless the SEO tab has
  already said noindex) and `GET /store/tags?all=1` — the sitemap's read:
  every shown tag with a published product, no limit, no category, adding
  `updated_at`, `indexable` and `seo.sitemap_include` to each row — marks it
  `indexable: false`, and `sitemap.ts` lists only `indexable` rows whose
  `sitemap_include` is not false. The plain `/store/tags` row is unchanged.
- **Caching.** The page is ISR: `generateStaticParams` returns `[]`, it reads
  no `searchParams`, cookie or header, and its fetches carry `store-tags`,
  `store-tag:<slug>` and `store-products` — so a product save and every Tags
  action refresh it, and `updateTagPageAction` purges the tag's own key. It
  shows the first page of `/store/products?tag=<slug>` and, when there are
  more, a link to `/store?tag=<slug>`; it renders `StoreFilterBar` itself like
  every page under `/store`.
- **A rename moves the address, and the 301 is written.** `StoreTag` is still
  not `Sluggable` (the slug is the identity the vocabulary is merged on, never
  derived from the name), so `TagController::redirect()` writes the `redirects`
  row on a rename and on a merge (old tag -> the tag it joined), and deletes any
  redirect that *starts* at the address now live, so renaming a tag back cannot
  loop. Deleting a tag leaves a 404; its `seo_metadata` row goes with it.
- **Links.** The chips on a **product page** open the tag page; the row on the
  shop and category pages still link to `/store?…&tag=…` (they sit on pages
  that must not read `searchParams`, and a filter is what they are for).
- **Console.** `/admin/store/tags/{id}` (`GET`/`PATCH`, `role:store_manager`):
  heading, introduction and SEO; name and the Shown switch stay on the list.
  `StoreTagPageTest` pins the 404s, the published-only count, the threshold, the
  sanitiser, the SEO override, the redirects and the role gate - the threshold
  and the sanitiser were control-run.

## Delivery charges and shipping zones (0.142.0)

**The behaviour change, first: the charge shown is now the charge taken.**
`store_shipping_paise` was displayed on every product page, declared in the
feed and written into the Offer markup — and read by nothing that built a
total. `Basket` never added it, `Checkout` never charged it and `orders` had
no column for it. A shop left at 0 (the seed, and every install so far) is
byte-for-byte what it was; a shop that had typed a figure starts charging it
with the first basket after the update. The existing cart, checkout, feed,
Zoho and report tests pass untouched in flat mode at 0.

**Two modes**, `store_shipping_mode` (`store` group, public): `flat` — the
setting is added to any order that ships something — and `zones`. Both are
written from `/admin/store/shipping` (`role:store_manager`), not the settings
strip (`HIDDEN`); `PATCH /admin/settings` and `PUT /admin/store/shipping/settings`
both refuse `zones` until `ShippingQuote::zonesReady()` — exactly one active
default zone that delivers and has a slab. `Fulfilment::shippingMode()` reads
a stored `zones` with nothing to quote from as `flat` rather than as free
delivery, and every zone write ends with `afterWrite()`, which rolls the
transaction back if zones mode is on and the arrangement could no longer
quote (deleting the default zone, taking its slabs, un-marking it).
`store_default_weight_grams` (500) stands in for a weight nobody entered.

**Tables.** `shipping_zones` (name, `states` as a list of two-letter codes,
`delivers`, `free_above_paise`, `extra_per_kg_paise`, `is_default`,
`sort_order`, `is_active`) and `shipping_rates` (`up_to_grams`,
`charge_paise`, unique per zone). `carts.ship_state` and `orders.shipping_paise`
(default 0), `shipping_zone` (the zone's *name* as it was), `shipping_weight_grams`.
`shipping_zone` is in the morph map. Rules, all the controller's, all judged on
what the zone *will be* after the write: one default zone; a state in at most
one **active** non-default zone; a zone that delivers needs a slab and an
`extra_per_kg_paise` (0 is an answer); no two slabs end at one weight; a
non-default zone needs a state; the default is always on, always delivers and
holds no states; a zone that does not deliver holds no slabs.

**`ShippingQuote::for(lines, ?stateCode, payablePaise)`** is the only place a
delivery figure is worked out. Weight is Σ quantity × (variation weight, else
product weight, else the default) over **physical lines only** — zero means
unset at either level. The first slab whose limit is **at or above** the
weight applies (1000 g belongs to "up to 1000 g"); above the top slab it is
that slab's charge plus `extra_per_kg_paise` per *started* kilogram of the
excess, in integers. `free_above_paise` is judged `>=` on **subtotal less
discount**: a code that drags a basket under the line should not leave it
free, and a basket exactly on the line is free. A state belongs to the first
active non-default zone listing it, else the default. A deliverable zone with
no slabs cannot quote and reads as undeliverable (the console cannot save
one; this keeps a database edit from becoming free delivery). Flat mode
charges the setting on a basket that ships; a basket with nothing physical
has no delivery and no destination question in either mode.

**GST.** Delivery is **GST-inclusive like every other figure**, and the tax is
extracted over the whole total: `total = (subtotal − discount) + delivery`,
`taxable = Money::taxable(total)`, `gst = Money::gst(total)`, stored once on
the order as before. The catalogue has one rate (`Money::GST_BASIS_POINTS`), so
delivery at 18% is identical to a composite supply taxed at the principal
rate; if a multi-rate catalogue ever arrives, delivery follows the principal
supply and this is the place to revisit. Coupons never touch delivery.

**The destination.** `PATCH /cart/destination {state}` (name or code; blank
clears; anything else is a 422 on `state` — a misspelling must never select
the cheaper zone) saves `carts.ship_state` through a no-timestamps save, so a
form field does not reset the idle clock the reminders read. The basket
summary gains `shipping_mode`, `shipping_paise` (**null** in zones mode until
a state is known — "Worked out at checkout", and left out of the total),
`shipping_label`, `shipping_zone`, `shipping_weight_grams`, `shipping_state`,
`shipping_deliverable` and — in zones mode only — `shipping_states`, the
API's own list of names for the form's select. `total_paise` includes
delivery once it is known. **The basket strip and the reminder emails quote
subtotal less discount, never `total_paise`**: a half-typed destination is not
a figure to email (`CartReminder::summary()` and `CartReminders::send()` read
`subtotal_paise - discount_paise`).

**The checkout re-quotes under its lock and the request supplies nothing.**
`Checkout::quoteDelivery()` weighs the rows it just locked and reads the state
of the block actually used for delivery (`shipping_address` when "deliver
somewhere else" is ticked, else `address`). In zones mode: an unresolved state
is a 422 on `{block}.state` (free text is refused — the form is a select, and
the server does not trust it); a zone that does not deliver is a 422 on the
same key with a sentence naming the state; and a destination that differs
from `carts.ship_state` throws `DestinationChanged`, which `place()` catches
**outside** the transaction (a save made inside it would roll back with the
refusal), saves the new state and answers 422 on `shipping` with the new
figure and total, so nobody confirms a total they did not see. Delivery is
added **before** the cash-on-delivery ceiling is judged. The order snapshots
`shipping_paise`, `shipping_zone` (the name) and `shipping_weight_grams`;
nothing downstream re-quotes — gateways, `Settlement`, `ManualPayment`,
`ManualRefund`, returns and the reports read `total_paise` and follow.

**Where it shows.** A Delivery row on the basket, the checkout (`data-delivery-row`,
re-quoted by `saveCartDestinationAction` as the state changes — typed,
chosen, or set by the PIN lookup, which dispatches `input`), the public order
page, the portal's and the console's (`DeliveryRow`, drawn only when the order
was charged or priced from a zone, so an old order reads as it did), the
order emails (`OrderMail::delivery()`, also omitted at a zero flat charge),
the sales CSV (a `Delivery (INR)` column) and `SalesReport` (`delivery_paise`,
its own figure). The customer's order resource carries `shipping_paise` and
`shipping_zone` and **not** the weight; the console's carries all three.

**Zoho.** `ZohoInvoices::lines()` appends a "Delivery — <zone>" line at the
charge with the goods' tax, omitted at 0, so the invoice's total still equals
the order's; the whole-refund credit note lists it too. A partial refund or a
return whose lines add up exactly stays what it was (delivery is not
refunded by a return unless the refund says so).

**Feed and markup.** In zones mode `ProductFeed::shippingBlock()` leaves out
`shipping_price`, `shipping_country`, `shipping_service` and the transit
times, and `StructuredData::storeProduct` omits `shippingDetails` — a single
figure would be a price the landing page does not charge, the mismatch that
suspends Merchant Center accounts. Handling time stays. **Set shipping rules in
Merchant Center itself** (the manual says so); the product page and the trust
strip say delivery is worked out at checkout. `feed.xml` draws `<g:shipping>`
only when the row has a price.

**The console.** `/admin/store/shipping` (Store → Shipping): the mode, the flat
charge, the default weight, the count of physical products with no weight
(`StoreProduct::scopeWithoutWeight()`, also `?no_weight=1` on the products
list — a product counts as weighed when it or any option has a weight), and
the zones as cards with a dialog (a `Modal`, refusals drawn inside it because a
toast behind an open `<dialog>` is inert). States already held by another
active zone are shown with whose they are and cannot be ticked. A save of the
mode or the flat charge purges `settings` and `store-products`: the product
page's wording and the cached JSON-LD both change with the mode.

**Fixes carried.** `ProductController::saveVariations()` no longer writes null
over a variation's weight when the key is absent (the editor never posted it;
it does now, and sends blank as null). The PIN directory files Telangana under
Andhra Pradesh and Ladakh under Jammu & Kashmir; `lib/pincode.ts` re-files
`500–509` and `194` and spells six old names (Pondicherry, Chattisgarh,
`Dadra & Nagar Haveli`, `Daman & Diu`, `Jammu & Kashmir`, `Andaman & Nicobar
Islands`) as the shop's own state list does, because in zones mode the state is
a select of those names and an option must match. `PincodeAutofill` fills a
`<select>` only with an option of exactly that value. `IndianStates` moved to
`App\Support`; `App\Support\Store\Zoho\IndianStates` remains as a subclass so the
old import still resolves.

**Not changed, on purpose.** Orders imported from WooCommerce keep delivery as
a service line (their total is history and is never re-quoted). The basket
strip and the reminders are untouched. Handling time and the transit window are
still one pair of settings, whatever the zone. There is no per-product shipping
class and no courier rate lookup — Shiprocket is a later release.

**Tests.** `ShippingZonesTest` — slab edges, quantity × weight and the
fallbacks, mixed and digital-only baskets, a 100% coupon, `free_above` after a
discount, an undelivered zone on both address modes, an unresolved state, the
COD ceiling crossed only by delivery, a stale and a never-quoted destination,
a request that tries to supply the charge, the gateway asked for the total,
the sales CSV and report, the order email, the Zoho line and credit note, the
reminder total, the zones-mode feed and markup, and every console rule.
`scripts/probes/shipping-zones.mjs` drives the checkout at 360 and 1280 and
puts everything back.

## Shiprocket: booking and tracking a parcel (0.143.0)

**Optional, off, and "By hand" stays the default.** `store_courier_provider`
(private `shiprocket` group) is `manual` or `shiprocket`. On `manual`, or on
`shiprocket` with the sign-in or the pickup location unsaved
(`CourierSettings::active()` is false), no control is drawn, no call is made
and the existing tracking form works exactly as it did. Every existing order
test passes untouched; `ShiprocketTest::test_a_manual_install_asks_nothing_of_anybody`
pins that nothing is asked, in both directions.

**There is no Shiprocket sandbox, and that decides the whole shape.** The
documentation says "any requests made using the valid API credentials will
affect the real-time data in your Shiprocket account". So: every test fakes the
service (`tests/Support/FakesShiprocket`, a routed `Http::fake()` under
`Http::preventStrayRequests()`, modelled on `FakesZohoBooks`); "Test the
connection" signs in and lists the pickup locations — the only two read-only
calls — and books nothing; `scripts/probes/courier.mjs` never switches the
provider on and never presses Book or Test. **It has not been driven against a
real account.** Every assumption about a shape the documentation leaves open is
one small place, commented `unverified against a real account:`, and listed
below.

### The client

`App\Support\Store\Shipping\Shiprocket` over Laravel's HTTP client, no SDK, base
`https://apiv2.shiprocket.in/v1/external`. Sign in, pickup locations, create
order, assign courier and AWB, request pickup, label, track by AWB, cancel.

- **The token** is cached for 9 days (it is good for 10), keyed on a hash of the
  API user's email. A 401 forgets it and signs in once more; a second 401 is the
  account's answer and is reported. A failed sign-in caches nothing.
- **A 200 can be an error.** Shiprocket answers HTTP 200 with `status: 404`, an
  empty label URL, `label_created: 0`, `track_status: 0`. Each method tests for
  the field it needs and treats its absence as a refusal in Shiprocket's words
  (`message`, then the first validation error); a body carrying an integer
  `status` of 400 or more is a refusal too. `track_status: 0` is *not* — it means
  no scans yet.
- **`shiprocket_error`** is the `mail_error` pattern: any refusal writes
  Shiprocket's words, the next success clears it, and it is written only when it
  changes. The settings panel shows it.
- **Ids.** `order_id` and `shipment_id` come back from create and are stored
  separately (`orders.shipment_order_id`, `orders.shipment_id`): AWB, pickup and
  label want the shipment id (as an array), cancel wants Shiprocket's order id.
  The webhook's own `order_id` is our reference "as Shiprocket holds it" and may
  carry a suffix, so it is never used to match; `sr_order_id`, then the AWB, is.

### Booking: once, in the right units, with only what a courier needs

`Shipments::book()`:

1. **A conditional claim** on `orders.shipment_booking` (the `ZohoInvoices`
   pattern): null, `failed` or `cancelled` → `creating`, in one UPDATE, so two
   presses cannot both create the order — a duplicate `order_id` has no
   documented safe response. A claim older than ten minutes is taken over. A
   courier-cancelled or returned parcel may be booked again.
   `ShiprocketTest` re-enters `book()` from inside the create call to prove the
   second is refused with the first still in flight.
2. **Every attempt after the first sends `{number}-{attempt}`** as the reference
   (`shipment_attempts`). Shiprocket will not take the id of a cancelled order,
   and a booking that failed with no usable answer may or may not exist there;
   a server fault says so in the order's error ("Shiprocket may still have
   received the order — check its panel before booking again").
3. **Units are converted at the edge on integers.** Weight is a three-place
   decimal *string* of kilograms built from grams by `intdiv` and a remainder
   (`Shipments::kg`, 1750 → `"1.750"`); money is rupees from paise (a whole
   number when it is one, else `Money::toRupeeString`'s exact decimal); sizes
   are whole centimetres, each at least 1 (Shiprocket requires above 0.5).
4. **Weight** is `orders.shipping_weight_grams` when the checkout recorded one,
   else `ShippingQuote::unitWeight()` per shipped line — the same rule a basket
   is weighed by — and the console's form can override it.
5. **Only what a courier needs leaves**: the name, the phone as ten digits, the
   delivery address (sent as the billing address too, with `shipping_is_billing`,
   so the billing address never travels), each *shipped* line's name, SKU,
   quantity and price, and the order number. Not the customer's note, not the
   GSTIN (the documentation does not require it), not a licence line.
6. **COD or Prepaid**: an order with `paid_at` is `"Prepaid"`; an unpaid
   cash-on-delivery order is `"COD"`; anything else unpaid is refused with a
   sentence, as are a digital-only order, a cancelled/refunded/refund-requested
   one and one with no address.

The courier, AWB and tracking link go into the existing `courier`,
`tracking_number` and `tracking_url` columns, so the emails, the timeline and
both order pages read a booked parcel without knowing where it came from. The
AWB step runs straight after create; if *it* fails (a low wallet, an
unserviceable pincode) the booking stands, `shipment_error` says why, and
**Assign a courier** can be pressed again without making a second order.

### Status: one place, never backwards

`ShipmentStatus::apply()` is where a webhook and the tracker both end. **It reads
`shipment_status_id`, never `current_status_id`**: Shiprocket has two numberings
(7 is Delivered in both, 8 is Canceled for a shipment and 5 for an order, 17 is
Out for delivery and 19 is) and a webhook carries both, the second unexplained.

- Every mapped id has a rank; an update below the stored rank, or the same id
  again, changes nothing (the `MessageDelivery::rank()` rule). An id not in the
  table is ignored, because storing it would let a label we cannot place
  outrank one we can. The order row is locked while it is applied.
- *Picked up, shipped, handed over, in transit, out for delivery* → the order
  moves to **Dispatched** through `moveTo()` — and from Paid through Ready for
  dispatch, because Paid may not go straight there — then `DispatchNotice::send()`
  sends the dispatch email and message. That helper is the one place
  `OrderDispatched` is sent (the console's status action calls it too), so a
  scan and a click cannot send it twice or from two places. Only a move *we* make
  sends it; an order already dispatched, completed or further is left alone.
- *Delivered* → `delivered_at` (the courier's time when it gave one), through
  Dispatched if the scans were missed, to **Completed**. `ReturnPolicy::deadline()`
  now counts from `delivered_at` first, then `completed_at`, then dispatch plus
  the transit window.
- *RTO (initiated, acknowledged, failed again, out for delivery, in transit,
  delivered) and cancelled* → **no status change**. `shipment_problem` is set
  (`returning`, `returned`, `cancelled`), a line goes in the order's trail, and
  `attention.shipments_in_trouble` counts it (`Order::scopeShipmentTrouble()`,
  the list `?shipment=problem` opens). A person decides what an order whose
  parcel came back becomes; the system will not guess at a refund.

### The webhook

`POST /store/shipping/webhooks/courier` (`CourierWebhookController`). **The
address must not contain "shiprocket", "kartrocket", "sr" or "kr"** — Shiprocket
refuses such a URL — so it names the role, not the vendor, and
`ShiprocketTest::test_the_webhook_address_names_neither_the_vendor_nor_its_short_forms`
reads the route's URI for all four. The settings panel prints the full address
and warns when the API's own domain contains one.

It follows the messaging webhooks: **200 always** (Shiprocket wants a bare 200),
**fails closed**, un-throttled. The payload carries no signature, only an optional
token in `x-api-key`, so `shiprocket_webhook_token` is compared with
`hash_equals` and *no token saved accepts nothing, even an empty header*. A forged
call could otherwise dispatch and complete orders and email customers about it.
Scans of the return leg (`is_return: 1`) are ignored; the provider being `manual`
makes it inert.

### The tracker

`technoware:track-shipments`, every 30 minutes (`routes/console.php`, above the
pause loop, so an update or a restore holds it). The webhook is the fast path
and this is the one that cannot be missed. Booked parcels with an AWB, not
delivered, returned or cancelled, oldest `shipment_checked_at` first, at most 40
a run (`--limit`). A parcel is stamped as checked *before* it is asked about, so
one that always fails cannot hold the front of the queue; a refusal stops the run
(a refused sign-in would be refused for every parcel) and is written to
`shiprocket_error`. **Always exits 0.** Does nothing while the provider is manual.

### The console and the customer

`GET /admin/settings/shiprocket` (`role:admin`, with `POST …/test`) reads the
pickup locations from Shiprocket **only while the provider is on and a sign-in is
saved**; on "By hand" the screen is opened as often as anybody likes and asks
nothing. The pickup location is a select with a blank first option (the 0.134.0
lesson), posted under `setting__shiprocket_pickup_location` only when drawn. The
order resource carries a `shipment` block on the detail read — null while manual
and nothing was ever booked — whose `can_*` flags are the answers the API will
give to the press, so a button is drawn only when it will be taken. The five
routes under `/admin/store/orders/{n}/shipment/*` are `role:store_manager`,
throttled, and 422 in Shiprocket's words. One `pending` governs the panel's
buttons, so the pressed one spins and its neighbours are disabled.

The customer's order carries `shipment_status` (only while it goes well — a
parcel coming back is for the desk to word) and `delivered_at`. `OrderTimeline`
gains a fifth **Delivered** step *only* for a parcel Shiprocket is following; a
hand-typed order keeps four, because a step nothing could ever reach is a promise.

### Unverified against a real account

1. That `payment_method: "COD"` collects `sub_total + shipping_charges`. There is
   no COD-amount field; the discount is taken off `sub_total` and `total_discount`
   sent as 0 so it cannot be subtracted twice. Check on the first real COD order.
2. That the money fields accept a decimal (they are typed `integer`); a whole
   rupee is sent as an integer.
3. That an expired token answers 401 on `apiv2` (only the serviceability host's
   body is documented), and the shape of a failed AWB assignment (wallet,
   unserviceable) — read through `message` and a few likely paths.
4. That the first `courier_id`-less assignment uses the account's default courier
   (the documentation says "the default courier").
5. The public tracking page's address (`https://shiprocket.co/tracking/{awb}`)
   and the time zone of every date Shiprocket sends.
6. That an unverified pickup location can be booked from (`phone_verified` is read
   and not enforced), and that a nickname rather than a code is what
   `pickup_location` takes.
7. Webhook retries, timeouts and whether a non-200 disables it; whether the
   `x-api-key` header is omitted when no token is set (we require one).
8. The label URL's lifetime (it is stored, and "Make the label" re-asks).

### Not built

Shiprocket's rate quotes (the delivery charge stays the zones'), return pickups,
manifests, several parcels for one order, the wrapper "forward shipment" call,
cancelling a shipment when the order is cancelled.
