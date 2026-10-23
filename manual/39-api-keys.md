# API keys: letting another system in

*Who can use this: administrators.*

**System → API keys** lets another system — your accounting package, a CRM
sync, a warehouse's stock program, a developer's script — **ask your site** for
leads, orders, customers, tickets, subscribers and shop stock, and do a few
small things in return: file a lead, add a subscriber, set a stock level.
(Webhooks, in Settings, are the other direction: your site telling them.)

A key is not a person's account. It has a name, a list of things it may do, and
a record of every time it was used.

## Making a key

1. Press **New API key**. Give it a name that says who or what uses it, such as
   "Warehouse stock sync".
2. Tick **what it may do** (next section). Tick as little as the job needs.
3. Choose when it **expires**: never, in 30, 90 or 365 days, or on a date.
4. If the other system always connects from the same place, type its address
   under **Allowed addresses** — one address or range per line. Leave it blank
   to allow any.
5. Press **Create key**.

The key is shown **once**, on that screen. Copy it now and keep it somewhere
safe: your site stores only a fingerprint, so nobody — not even you — can read
it again. If you lose it, **roll** the key (below) to get a new one.

A key starts with `ak_`. Treat it like a password: anyone holding it can do
whatever you ticked, from anywhere you allowed.

## Choosing what it may do

| Permission | What it allows |
|---|---|
| Read leads | List and open leads |
| File a lead | Add a new lead (it appears in Leads as coming from the API) |
| Read orders | List and open shop orders |
| Read customers | List and open portal customers |
| Read tickets | List and open tickets and their customer-visible conversation |
| Read subscribers | List newsletter subscribers |
| Add subscribers | Add or update a subscriber |
| Read shop products | List shop products with price and stock |
| Set stock | Set a product's or option's stock level by its SKU |

What a key can read is the same information a webhook is sent. Internal notes
on tickets and orders are never included, and a ticket marked sensitive shows
"Marked sensitive" in place of its words.

A key cannot sign in to the console and cannot change anything not in the table.

## Giving it to a developer

Send them the key and the **base address** shown on the key's screen (your API
address followed by `/api/v1/ext`). Each request carries the key in a header:

```
Authorization: Bearer ak_…
Accept: application/json
```

The key's screen shows a ready-made example you can copy, and `GET /me` tells
the other system which permissions its key has. The technical reference is the
**Integration API** section of `API.md` in your delivery.

Some things they should know:

- A key may make **120 requests a minute**. Past that it is told to wait.
- Lists return 50 records a page (up to 100) and can be asked only for records
  changed since a date, so a nightly sync does not re-read everything.
- A key that is revoked, expired, used from a wrong address or missing a
  permission is refused with a short reason.

## Seeing how a key is used

Open a key to see when it was last used and from which address, a chart of its
requests over the last 30 days, and a list of recent requests — the address
asked for, the answer and how long it took. The list keeps 30 days. Requests
refused for going over the limit are not listed.

## Changing, revoking, rolling and deleting

- **Edit** changes the name, permissions, expiry and allowed addresses. It
  takes effect at once.
- **Roll** makes a brand-new key for the same entry — same permissions, same
  history — and the old key **stops working immediately**. Use it when a key
  was lost or may have leaked, then give the new one to whatever uses it.
- **Revoke** switches the key off for good. Its history is kept. A revoked key
  cannot be edited or rolled; make a new one instead.
- **Delete** removes the key and its history.

## Things to know

- The key is shown once, when it is made or rolled. Copy it before leaving.
- Tick only what the job needs, and set an expiry for anything temporary.
- File a lead through a key and it is counted in Leads, but not as a website
  visit's conversion in Analytics.
- Stock set through a key is recorded in the stock report under the key's name.
- Adding a subscriber through a key never re-adds somebody who unsubscribed.
