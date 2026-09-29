# The support desk

*Who can use this: Support engineer and Administrator. Tickets → Email to ticket: Administrator only.*

Customers raise support tickets from the customer portal, or — if you switch
it on — simply by emailing your support address. Your staff answer them in
the console. This chapter covers the queue, replying, internal notes,
sensitive messages, saved replies, merging tickets, email-to-ticket, and what
the customer sees in the portal.

The screens are under **Tickets** in the sidebar: **Tickets** (the queue) and,
for administrators, **Email to ticket**. The **Dashboard** at the top of the
sidebar summarises the desk.

## The dashboard

**Dashboard** shows the last thirty days: new and resolved tickets, the
median time to first response and to resolution, how many met their response
target, and open tickets by priority and category. A chart of ticket volume
can be switched between a month, a quarter, half a year and a year. Every
figure opens the list of tickets behind it.

A figure with nothing behind it shows as a dash, not zero — "no data" is
different from "instant".

## The ticket queue

**Tickets → Tickets** lists every ticket. By default the most urgent are at
the top: critical first, then oldest. You can:

- filter by status, priority or assignee (including *Unassigned*), and tick
  **Overdue only**, **Reported replies** (a staff reply the customer
  reported) or **Open only**;
- search by reference, subject or customer;
- sort by pressing a column heading;
- tick several tickets and change their status, priority or assignee at once
  from the bar that appears. If a change is not allowed for some tickets, the
  others are still updated and the ones refused are listed.

Each ticket has a reference like `AN-2026-00042`, which appears in every
email about it. The letters at the front are set under **System → Settings →
Reference numbers** (*Ticket number prefix*); at install they are your
company's initials. Changing them affects new tickets only — existing tickets
keep their numbers, and email replies quoting an old number still reach the
right ticket.

### Statuses

| Status | Meaning |
|---|---|
| Open | New, nobody has it yet |
| Assigned | Somebody has it |
| In progress | Being worked on |
| Pending customer | Waiting for the customer to reply |
| Resolved | Fixed, awaiting confirmation |
| Closed | Finished |

The status list on a ticket only offers the moves that make sense from where
it is. A few happen by themselves:

- **Assigning** an open ticket moves it to *Assigned*.
- **Replying** to an open ticket (a reply the customer can see) moves it to
  *In progress* and stops the first-response clock.
- A **customer replying** to a ticket that is *Pending customer* moves it back
  to *In progress*.
- A resolved or closed ticket can be **reopened** — by you, or by the
  customer from the portal.

### Priorities and response targets

Priorities are *Low*, *Normal*, *High* and *Critical — service down*. Each has
a first-response target — 24, 8, 4 and 1 hours respectively — which a ticket
category can shorten or lengthen. A ticket past its target shows as
**Overdue**.

## Working a ticket

Open a ticket to see its category, when it was raised, and the conversation —
starting with the customer's original request and any files sent with it.

To reply:

1. Type in the reply box. To use a saved reply, choose one from **Insert
   saved reply** — it arrives with the customer's name, the reference and
   your name already filled in. Edit it as you like.
2. Attach files if needed.
3. Tick **Internal note — not visible to the customer** if this is for your
   colleagues only.
4. Tick **This reply contains sensitive data — encrypt its contents** if it
   holds passwords, keys or similar.
5. Press **Send reply to customer** (or **Save internal note**).

Change the status and the assignee from the two dropdowns at the top of the
ticket (they are also on each row of the queue). To change a ticket's
priority, tick it in the queue and use the bar that appears.

### Internal notes

An internal note is **never shown to the customer**: not in the portal, not
in any email, not through any other route. Use it for engineering detail,
passwords you looked up, or anything a colleague needs to know. The button
changes to *Save internal note* while the box is ticked, so you can see which
you are about to send. Attachments on an internal note are internal too.

### Sensitive messages

Either side — you or the customer — can mark a message **sensitive**. Then:

- the message is stored **encrypted**;
- the email notification says that a sensitive reply is waiting and tells the
  person to open the ticket, instead of quoting it;
- it is not passed to any connected system (webhooks, chapter 18).

Sensitive messages show an **Encrypted** badge. The subject line is never
encrypted, so keep secrets out of it. A customer can mark the ticket's
original description sensitive in the same way when raising it.

## Saved replies

Press **Saved replies** on the queue to manage the desk's shared stock
answers. Each has a title and a body. In the body you can use placeholders,
which are filled in when the reply is inserted:

| Placeholder | Becomes |
|---|---|
| `{{customer_name}}` | The customer's full name |
| `{{first_name}}` | Their first name |
| `{{company}}` | Their company |
| `{{reference}}` | The ticket reference |
| `{{subject}}` | The ticket subject |
| `{{agent_name}}` | Your name |

The form lists the placeholders beside the box. Saved replies are plain text.

## Merging tickets

When a customer opens two tickets about the same problem, merge one into the
other:

1. Open the ticket you want to **close**.
2. Press **Merge into…**, then pick another open ticket of theirs, or type a
   reference.
3. Press **Merge tickets**.

All messages and attachments move to the other ticket; the first is closed
with a note saying where the conversation went, and the customer gets one
email about it.

- You can only merge tickets that belong to the **same customer**. There is no
  override — moving one customer's messages onto another's ticket would show
  them to the wrong person.
- A merged ticket cannot be reopened or replied to. If the customer replies to
  an email about it, the reply lands on the ticket it was merged into.

## Email to ticket

Off by default. Switched on, a mailbox (for example `support@yourcompany`) is
read once a minute. Each new message becomes a ticket, the sender gets the
usual acknowledgement with the reference, and the desk is told — exactly as if
the ticket had been raised in the portal. A reply that quotes the reference
lands on the existing ticket.

An administrator sets it up under **Tickets → Email to ticket**. There are
three ways to connect the mailbox:

- **IMAP** — any mailbox: enter the server, port, encryption, username and
  password from your email provider.
- **Gmail or Google Workspace** — create an OAuth client in Google Cloud (Web
  application), add the callback address the screen shows, paste the client
  ID and secret, save, then press **Connect a Google mailbox** and sign in to
  the mailbox.
- **Microsoft 365 / Outlook** — register an app in Microsoft Entra ID with the
  callback address shown, the permissions `IMAP.AccessAsUser.All`,
  `offline_access`, `openid` and `email`, and IMAP switched on for the
  mailbox. Paste the client ID and secret, save, press **Connect a Microsoft
  365 mailbox**. Shared mailboxes are not supported — use a licensed mailbox.

Then:

1. Choose **After a message is handled**: *Move it to a folder* ("Processed"
   by default — recommended if people also read this inbox by hand) or *Mark
   it as read*. With *Mark it as read*, a person opening a message before the
   minute ticks stops it becoming a ticket.
2. Choose what happens to **An address with no portal account**: *Open a
   ticket and create a portal account*, or *Ignore it* (it is listed on the
   screen).
3. Choose the category and priority new email tickets get.
4. Press **Check the connection** — it connects and counts unread mail
   without changing anything.
5. Switch on **Open tickets from email** and press **Save mailbox settings**.

What is **never** turned into a ticket: mail from your own sending addresses,
mail from staff accounts, out-of-office and other automatic replies, bounces,
mailing lists and newsletters, and messages the sender's provider flagged as
forged. The quoted history at the bottom of a reply is trimmed off.

Attachments follow the portal's rules (pictures, PDFs, plain text and logs, up
to five per message). A problem connecting to the mailbox shows as a red
banner on the screen in the mail server's own words.

## The customer portal

Customers sign in at your website's `/portal` address (chapter 09 covers
accounts). In the portal they can:

- see their tickets, filtered by status, with counts on the dashboard;
- **raise a ticket** — choosing a category and priority, attaching files, or
  pasting a screenshot straight into the form. The form opens with a link to
  search the knowledge base first, which answers many questions before they
  are asked;
- read the conversation and **reply**, quote an earlier message, and mark a
  message sensitive;
- **close** a ticket, or **reopen** one that was not really fixed;
- give a staff reply **one to five stars**, or **report** it with a reason.
  Reported replies can be found with the *Reported* filter on the queue, and
  the stars and reason appear under the reply in the console.

The portal never shows internal notes, their attachments, or staff-only
information.

## Things to know

- Internal notes are never shown to customers — but check the box before
  pressing the button; the button's wording tells you which you are sending.
- Sensitive messages are encrypted and not quoted in email; the subject line
  is not.
- Merging only works between tickets of the same customer, and cannot be
  undone.
- Email to ticket depends on the site's scheduled tasks running every minute
  (see the installation chapters). If the scheduler stops, mail simply stops
  arriving as tickets, with no error.
- With email to ticket switched on, replies to ticket notifications are
  directed to the support mailbox; with it off, customers are told to reply
  through the portal instead.
- If your install came with demo content, the sample support desk (a customer
  called Neil Basu, his tickets and two enquiries) is invented. Ask your
  supplier to clear it before launch — the console deliberately has no way to
  delete a customer or a ticket.
