# Customers and addresses

Account lifecycle, registration, the one address definition, company suggestions.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**A customer account has a lifecycle, not a switch.** `customers.status` is
`pending` / `active` / `rejected` / `suspended` (`App\Enums\CustomerStatus`),
and **only `active` may sign in**. It replaced `is_active`, which could not
tell "waiting for a human" from "switched off by a human" — two states that
want opposite words in front of whoever is at the sign-in form. Dropping that
column broke `EnsureUserIsCustomer`, which still read it: the missing attribute
evaluated as false and *every* authenticated portal request 403'd. The
middleware and the login now both call `canSignIn()`, so there is one answer to
"may this account be here".

**The registration endpoint must never reveal whether an address exists.** New,
already-registered and honeypot-tripped all return the same 202 and the same
sentence. Anything else turns the form into a membership oracle — submit
addresses, read which come back "already taken", and you have a list of this
company's customers, which for a support portal is a list worth phishing. The
real account holder is told by email instead; they are the only party entitled
to know. `tests/Unit`-style coverage for this is in
`tests/Feature/CustomerRegistrationTest.php`, which asserts the two responses
are byte-identical rather than merely both successful.

**A login refused on status returns 403 with a `reason`, and the frontend
branches on that, never on the message.** `email_unverified` gets a resend
button; `pending_approval` gets an info panel with nothing to press, because
there is nothing the person can do. A message string is written to be read by a
person and will be reworded; a screen that changes shape when somebody fixes a
typo in a sentence is a screen nobody can maintain. `ApiError` carries `reason`
for this.

**A ticket customer and a store customer are one row, and the address columns
follow from that.** `customers` gained `billing_address`, `shipping_address`
and `gstin` — **the last ones used, never a history**. The order already keeps
its own immutable copy of what it was billed and shipped to; that is what an
invoice reads and it must not change when somebody moves. These three are a
convenience for the *next* form, which is why overwriting them on each order is
right rather than lossy. Written by `Checkout::rememberDetails()` from both
branches of `accountFor()`, guarded and logged rather than thrown — money has
arrived by then, the rule `StockLedger` and `Notifier` already follow.

**`shipping_address` is null on the account while it is the same, and a copy on
the order.** The two are not inconsistent: the account is storing *the answer to
a question* — is there a second address — and the order is storing where a
parcel actually went. Read from the checkbox, never by comparing the two
blocks: two addresses that happen to match today are still two answers, and
`Checkout::shippingAddress` has always resolved the order's copy from the
billing one for anything that ships.

**Both addresses are validated whenever anything ships, not whichever one the
parcel goes to.** That was the first cut and it left a hole: ticking "deliver
somewhere else" made the *billing* block optional, so an order could be placed
with a blank invoice address. The form marks both required and the form is not
the boundary. The two messages differ because the fields do different jobs —
one is where the invoice is made out to, the other is where the parcel goes.

**One `AddressFields` component renders both blocks, keyed by a name prefix.**
A second copy of those six fields is six more places for the PIN-code-first
order to drift or a `required` to be forgotten. `PincodeAutofill` finds its
fields by `name` through `closest("form")` and takes a `names` prop, which is
the only reason two instances can sit in one form without filling each other's
boxes.

**A customer's address lives on their account and is editable from the portal.**
`/portal/profile` has a "Billing and delivery" section — the billing address,
an optional GSTIN, and a second address behind "deliver to a different
address". Before it the columns were written only by the checkout, so an
address could be changed by placing another order and by no other means:
stored data with nothing able to reach it, the mirror image of an endpoint
with no control behind it.

**Nothing there is required, and the checkout's version is.** An address is a
condition of *delivering* something, not of holding an account — a profile
screen that refuses to save a corrected phone number until a PIN code is typed
is a screen arguing with whoever opened it. `AddressFields` takes a `required`
prop for exactly that, and the server makes the same split:
`UpdateProfileRequest` never requires one, `CheckoutController` does.

**`App\Support\Address` is the one definition of an address**, shared by the
checkout and the profile — `rules()`, `normalise()`, `isBlank()` and `same()`.
Two screens holding two copies of six field rules is the drift that produced
`admin_path` in the API's resource names.

**`Address::same()` exists because `===` on two addresses is wrong the moment
one has been through MySQL.** The JSON type normalises object keys by length
then alphabetically, so an address written `line1, line2, city, state, pin,
country` reads back `pin, city, line1, line2, state, country` — the trap
`App\Casts\SpecSheet` already exists for. `Checkout::rememberDetails()` compared
with `===`; both sides happened to come from the same in-memory order, so it
worked and was one refresh away from not. The failure would have been silent
and in the wrong direction: a duplicate delivery address stored for every
customer who does not have one. Found by a test that asserted the written key
order and failed.

**`isBlank()` ignores `country` and `same()` does not.** It is the one part
that is *defaulted*, so every normalised address carries "India" whether or not
a person typed anything — a blankness check counting it would call an empty
form a filled-in address. Two addresses differing only by country are still two
addresses, which is a different question.

**The profile's address fields are read from the form on every save, unlike
every other field on that screen.** The plain fields skip an empty value,
because blank means "unchanged" there. An address has to be *deletable* —
somebody who has moved must be able to clear the old one — so those are always
sent, and a block with nothing in it is stored as **null** rather than six null
keys.

**A company name is suggested from the ones already on file, and that is the
one endpoint here that answers a question about the customer list.**
`GET /companies/suggest` — public, because it sits on the registration form.
The guard is a **prefix** match (never a substring: `%meridian%` lets two
characters sweep the middle of every name on the list), a three-character
floor, five results and a 20/min throttle. That is not proof against a
determined crawl and is not meant to be; it bounds the casual case. It is
acceptable here and `/auth/register`'s membership oracle is not because an
email address identifies a *person* and is the first half of phishing them,
while this business already publishes client names on its own case studies.

**If that stops being true the fix is one line** — move the route inside the
admin group. The LIKE metacharacters are escaped as well as bound, or a single
`%` is a full listing.

**It is a `<datalist>`, not a combobox.** Suggestions with no new tap target —
which `npm run audit` counts — and it degrades to a plain text input where it
is unsupported, which is the right failure for a convenience. Same call the PIN
code's city suggestions make. Debounced at 250ms and the in-flight request
aborted, or a slow answer for "me" lands after the answer for "meridian" and
replaces it.
