# Analytics: who visits your site

*Who can use this: administrators, SEO managers and content managers.*

**Site → Analytics** shows how many people visit your website, which pages they
read, where they came from, what they searched for and which of them got in
touch or bought something. The website counts these itself, **without cookies**,
so it needs no consent banner and nothing is sent to anybody else.

## Reading the screen

Choose a period at the top — 7, 30 or 90 days, this month, last month or dates
of your own — and what to compare it with: the period just before, the same
dates last year, or nothing. Each figure shows how much it has changed.

The tiles across the top:

- **Visits** — how many people came (see the next section).
- **Page views** — how many pages they opened in all.
- **Views per visit** — page views divided by visits.
- **Bounce rate** — the share of visits that read one page and left.
- **Conversions** — enquiries, orders, visit and meeting requests, event
  registrations and newsletter sign-ups.
- **Revenue** — what the paid shop orders came to.
- **Right now** — pages opened in the last 30 minutes.

Under them is a chart of views and visits for each day, with the earlier period
as a dashed line, and then panels you can read down: top pages, the pages people
arrived on, channels (search, social, email, other websites, campaigns, direct),
sources, campaigns, devices, browsers, countries, conversions by channel,
searches, **searches that found nothing**, links to other sites, downloads, and
calls, emails and WhatsApp. Each panel has a **CSV** link for a spreadsheet.

**Searches that found nothing** is the most useful list on the screen: it is
what visitors wanted and did not find. It looks back up to 90 days, whatever
period you chose.

Press a page in **Top pages** to see that page on its own: its views by day,
where its visitors came from, and the enquiries or orders made from it.

Today's figures update as visitors arrive. Yesterday's and earlier days are
final by about half past midnight.

## What a visit is

A visit is one person on one day. The website gives each visitor a code made
from their address and browser and **a secret that changes at midnight and is
then thrown away**. So the same person coming back tomorrow is counted as a new
visit, and nobody — not even us — can join the two. That is why the figures are
"visits", not "people": a person who comes on three days is three visits.

## What is never counted

- Your **address** is never stored, and neither is a full description of the
  browser. What is kept is the page, where the visitor came from, the kind of
  device, browser and system, the country and the day's code.
- The **console**, the customer portal and the pages that only one person is
  meant to see (an order's page, a meeting or visit link, an unsubscribe link,
  a draft share link) are never counted.
- Visitors whose browser says **Do Not Track** or **Global Privacy Control**.
- Robots and search-engine crawlers.
- Search words that look like an email address or a phone number are not kept.
- Staff who are signed in to the console are not counted, unless an
  administrator switches that on.

## Switching it off

An administrator can switch counting on or off in **Site → Settings →
Analytics**, with **Count visits on this site**. Off, nothing new is counted and
the Analytics screen says so; what was counted before stays.

## Leaving the office out

In **Settings → Infrastructure → Visit counting**, **Addresses to leave out**
takes one address or range per line, for example `203.0.113.7` or
`203.0.113.0/24`. Put your office's address there so your own staff browsing the
site do not count as visitors. **Count signed-in staff** is off by default; it
only matters for staff who are signed in to the console.

## Using Google Analytics as well

You can keep Google Analytics 4 running beside this. The two will not agree
exactly — Google uses cookies and counts differently — and that is normal. Where
both could answer, the console shows this site's own figures. If you switch
counting off, the console falls back to Google Analytics (when it is connected).
Google's tags still wait for the cookie banner; this counting does not need it.

## About the countries

Countries are worked out from the visitor's address using a list from
[DB-IP.com](https://db-ip.com) (IP to Country Lite, licensed CC BY 4.0). The
address itself is not kept.

## If a number looks too low

A visitor who closes the page within a second or so is not counted, because the
website waits for the page to settle before it counts. Visitors who have Do Not
Track switched on, or who use a privacy extension that blocks counting, are
missing too. Treat the figures as a reliable trend, not an exact head-count.
