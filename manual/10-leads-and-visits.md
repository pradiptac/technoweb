# Leads, engineer visits and online meetings

*Who can use this: Leads — Sales manager and Administrator. Visits and Meetings — Sales manager, Support engineer and Administrator. Meeting types — Sales manager and Administrator. My meetings — Meeting host. Leads → Scoring, Visits → Visit settings, Meetings → Hosts and Meetings → Settings: Administrator only.*

## The lead pipeline

Every enquiry that arrives through your website becomes a **lead** in one
list, whichever form it came through:

- the contact page and the enquiry forms on service and solution pages;
- every form you built yourself under Site → Forms;
- gated-download and webinar banners;
- the chat assistant, when a visitor asks to be called back;
- engineer visit requests (below).

The email the sales desk receives is just the announcement. The lead is the
record you work from: it has a status, an owner, a follow-up date and a
value, and it is kept even if the email never arrives.

Leads live under **Leads → Leads**.

### The list

Filter by status, score (hot, warm, cold), owner, or **Still open**; search by
name, email, company or message. The **Sort** menu orders the list newest
first, oldest first, by highest score or by follow-up date. Above the list,
links such as **5 not yet answered** and **2 past its follow-up date** open
just those leads.

You can triage straight from the list:

- change a lead's **status** from the dropdown in its row;
- press **Take it** to make yourself the owner.

**Export CSV** downloads the current list as a spreadsheet.

### Working a lead

Open a lead to see:

- the contact details and the message, exactly as sent;
- **the page it was sent from** and, where known, the campaign that brought
  the visitor;
- the **score** with its reasons (below);
- **everything else the same email address has sent** — earlier enquiries are
  listed rather than merged, so no message is ever lost;
- the history of every change, and your notes.

From there you can set the status, the owner, a **follow-up date** (*Follow
up on*), the **Estimated value (₹)**, and add notes. A lead with a follow-up
date in the past shows as overdue.

### Statuses

| Status | Meaning |
|---|---|
| New | Nobody has replied yet |
| Contacted | Somebody has been in touch |
| Qualified | A real opportunity |
| Won | Became business |
| Lost | Did not |
| Spam | Not a real enquiry |

The dropdown only offers the moves allowed from the current status. *Won* and
*Spam* can both be undone, because a mis-click should never lose a customer.
Moving a lead to *Contacted* or beyond records the date of first contact;
moving a *New* lead straight to *Lost* does not, because nobody replied.

There is no way to create a lead by hand: every lead is something a person
actually sent. Deleting a lead keeps the original submission.

### Scoring

Each lead is scored 0–100 when it arrives, from these checks:

| Check | Weight |
|---|---|
| Business email address (not Gmail, Yahoo and the like) | 20 |
| Asks about buying — price, quotation, tender, AMC and similar words | 20 |
| Phone number given | 15 |
| Company named | 15 |
| Describes what they need (a message of reasonable length) | 15 |
| Came from a specific page rather than a general one | 10 |
| Message is not a list of links | 10 |
| Has enquired before | 5 |

A check that does not apply — say, a form that never asked for a message — is
left out of the sum rather than counted as a failure. **70 or more is hot, 40
or more is warm**, below that cold. A lead where nothing applied shows a dash.

The score is a **hint to help you decide what to answer first** — nothing is
ever filed as spam automatically. A low score stays in the queue for a person
to judge.

**Leads → Scoring** (administrators) lets you add your own buying words in
**More buying words**, one word or phrase per line — the terms your customers
use when they are ready to buy ("PO" is a good first addition; it is not in
the built-in list). Every word matches as a whole word only (so "PO" does not
match "port"), and words of three letters or more also match their plurals
and "-ing" forms. A lead keeps the score it was
given when it arrived; if you want the whole list re-scored on new words, ask
your supplier to run the re-score.

## Engineer visit requests

Customers can ask for an engineer to come to their site through the **Book a
site visit** page on your website (`/book-a-visit`). A visit request is a
**wish list, not a booking**: the customer offers up to three preferred dates
and parts of the day, and your desk confirms the actual time. There is no live
availability calendar.

### Setting it up

An administrator opens **Visits → Visit settings**:

| Setting | What it does |
|---|---|
| Take visit requests online | On shows the form; off shows a line asking people to call |
| Parts of the day | One per line as `key|Label|start|end`, e.g. `morning|Morning|09:00|12:00`. Rename the label, not the key, once requests exist |
| Days engineers visit | e.g. `mon,tue,wed,thu,fri,sat` |
| Notice needed (days) | The earliest day that can be asked for. 1 means tomorrow |
| How far ahead (days) | The latest day that can be asked for |
| Closed dates | One per line as `YYYY-MM-DD`, with an optional note — `2026-10-20 Diwali` |
| Visit requests go to | The desk's email address (blank uses the sales address) |
| Default visit length (minutes) | What the confirm form suggests |

A request for a day or time the settings do not allow is refused on the form
with a clear message.

### What happens when a request arrives

- It appears in **Visits → Visits** with status *Requested* and a reference
  like `ANV-2026-00007`. The letters are set under **System → Settings →
  Reference numbers** (*Engineer visit prefix*); at install they are your
  company's initials plus V. Changing them affects new requests only.
- It also becomes a **lead**, linked both ways.
- The desk gets an email with the details and the customer's notes; the
  customer gets a receipt listing the times they chose (never their notes).
- If the customer opted in, they also get a WhatsApp or RCS message (chapter
  12).

A customer who was signed in to the portal sees the request under their
account. A guest gets an email link to view, change or cancel it.

### Working the list

**Visits → Visits** shows requests waiting to be confirmed first (oldest
first), then the diary (soonest first), then finished ones. Search, or filter
by status, engineer or date (**Visit from** / **Visit to**); the links at the
top — *waiting for a time*, *today*, *booked with no engineer* — open just
those visits.

To confirm a visit:

1. Open the request and read the preferred times and the site address.
2. Agree a time with the customer if needed.
3. In **Confirm a time**, fill in **Arrives (IST)**, **Allow (minutes)** and
   the **Engineer** (or *Not decided yet*), then press **Confirm and tell
   them**.
4. The customer is emailed the confirmed time **with a calendar file
   attached**, so it goes straight into their calendar.

The customer is reminded by email automatically about 24 hours before a
confirmed visit (no reminder is sent if you confirm less than a day ahead).

### Statuses

| Status | Meaning |
|---|---|
| Requested | Waiting for the desk to set a time |
| Confirmed | A time is agreed |
| Completed | The visit happened |
| No-show | Nobody was there |
| Cancelled | Called off, by either side |

- *Confirmed* is reached only through **Confirm a time** — it is not in the
  status dropdown.
- **Moving** a confirmed visit (**Move the visit**, then **Move and tell
  them**) keeps it confirmed, emails the customer the new time, and updates the calendar entry
  they already have.
- If the **customer** asks for different times, the visit goes back to
  *Requested* and the agreed time is cleared.
- Either side can cancel. When you cancel, give a reason — it is included in
  the email to the customer.
- *Completed* and *No-show* can be corrected into each other; a cancelled
  visit can be reopened.
- The **desk note** on a visit is never shown to the customer.

## Online meetings

Customers can book a **video call** through the **Book a meeting** page on
your website (`/book-a-meeting`), or from their portal account. Unlike a visit
request, this *is* a booking: the customer sees only the times somebody is
actually free, picks one, and it is theirs. Every booking gets a Google Meet
link when your Google Workspace calendar is connected.

### Setting it up

Meetings are **off until you switch them on**, and three things are needed
first:

1. **Hosts** — the people who take calls. Give each one the **Meeting host**
   role under Staff (chapter 17). An administrator is *not* offered to
   customers unless they hold that role too. Then, under **Meetings →
   Hosts**, set each host's working hours (or leave them on the defaults)
   and add any time off.
2. **Meeting types** — under **Meetings → Meeting types**: the kinds of call
   you offer ("30-minute consultation", "Product demo"), how long each is,
   an optional gap before and after, which hosts may take it (none ticked
   means every host), and whether customers can book it or only your staff.
3. **Meetings → Settings** (administrator):

| Setting | What it does |
|---|---|
| Take bookings online | On shows the booking page; off, the console can still schedule meetings |
| Default working hours | One line per stretch as `days|start|end`, e.g. `mon-fri|10:00|18:00` — the hours of any host without their own |
| Start times every | 15, 30 or 60 minutes between the times offered |
| Notice needed (hours) | The earliest a customer can book from now |
| How far ahead (days) | The latest day that can be booked |
| Closed dates | One per line as `YYYY-MM-DD` |
| Reminders (minutes before) | e.g. `1440,60` — a day and an hour before |
| Bookings go to | The desk's email address for new bookings |
| Google busy time blocks bookings | On, a time a host is busy in Google Calendar is not offered |
| Customers may change up to (hours before) | After this the customer can no longer move or cancel; your staff still can |
| Upcoming bookings per person | How many future meetings one email address or mobile may hold |
| Moves a customer may make | How many times a customer may move one meeting |
| Bookings per address per day | A ceiling against somebody (or a script) filling the diary |

### Connecting Google Calendar

On the same screen, the **Google Workspace calendar** panel. Create an OAuth
client (Web application) in Google Cloud with the Calendar API switched on,
register this callback address on it:

```
https://<your website>/admin/meetings/google/callback
```

paste the client ID and secret, save, then press **Connect Google Calendar** and sign in as
the account that should organise the meetings — a shared one such as
`meetings@` is best. Leave **Calendar** blank for that account's main
calendar. **Test the connection** tries it without booking anything.

Connected, every meeting becomes an event on that calendar with the host and
the customer invited and a Meet link on it. Not connected, meetings still
work: the customer's confirmation carries a calendar file instead, and you
send the video link yourself. A meeting booked while nothing was connected
keeps using the calendar file even after you connect, so nobody is invited
twice.

### What happens when somebody books

- The meeting appears in **Meetings → Meetings** with status *Scheduled*
  and a reference like `ANM-2026-00003` (the letters are set under **System →
  Settings → Reference numbers**).
- It also becomes a **lead**, linked both ways.
- The desk gets an email; the customer gets a confirmation with the Meet link
  (or the calendar file), and reminders before it.
- The customer can move or cancel it from the link in their email, or from
  the portal, until the cut-off.

### Working the diary

**Meetings → Meetings** lists every meeting, soonest first, with filters for
status, host, type and date. Open one to:

- **Move the meeting** to another time or another host. The picker shows who is free
  at each time. Two ticks let you book outside a host's working hours or over
  a time Google shows them busy; nothing lets you book over another meeting.
- **Cancel the meeting**, with a reason the customer is sent.
- Record the **outcome** once it has started — *Completed* or *No show*.
- **Retry the sync** with Google, if the panel says it failed.

**Schedule a meeting** books one on somebody's behalf, skipping the notice
and the booking window. **My meetings** is a host's own list.

## Things to know

- Every web enquiry is a lead, even if the notification email fails.
- Scores are hints; nothing is ever marked spam automatically.
- A lead's score is fixed when it arrives; changing the buying words does not
  re-score old leads by itself.
- A visit request is not a booking until somebody confirms a time.
- Keep **Closed dates** up to date before each holiday season.
- Renaming a part-of-day **key** in the settings orphans old requests; rename
  only the label.
- A meeting is a booking; a visit request is not. A host must hold the
  Meeting host role.
- Reminders and confirmation emails depend on the site's scheduled tasks
  running (see the installation chapters).
