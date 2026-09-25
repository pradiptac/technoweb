# The store

A separate catalogue with prices; baskets, checkout, payment, stock, coupons, digital codes, the Merchant Center feed, the catalogue as a spreadsheet, back-in-stock notices.

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

**Not built, deliberately:** `AggregateRating` and `Review` are absent from
every graph in the product. They are a Merchant Center enhancement, not a
requirement, and inventing them is out of the question — noted so the absence
reads as a decision rather than a gap.

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
