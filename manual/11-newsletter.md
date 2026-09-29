# The newsletter

*Who can use this: Campaign manager and Administrator. Campaign → Settings: Administrator only.*

The newsletter lets you keep a mailing list, organise it into groups, send
email campaigns built from blocks, test subject lines, follow up with people
who did not open, and run automatic sequences of emails for new subscribers.

It lives under **Campaign** in the sidebar. The Campaign screen has its own
strip of tabs across the top:

| Tab | What it is for |
|---|---|
| Dashboard | How your campaigns have performed overall |
| Subscribers | The list: add, import, filter, export |
| Verification | Address checking through Hunter |
| Groups | Named segments of the list |
| Campaigns | Writing, testing, sending and reports |
| Sequences | Automatic follow-up series |
| Templates | Starting points for campaigns |
| Unsubscribes | The do-not-mail list |

## Before your first campaign

An administrator opens **Campaign → Settings** and fills in:

- **From name** and **From address** — the address must be on a domain whose
  SPF and DKIM records name your mail provider (ask whoever manages your
  domain's DNS). Sending "as" an address the provider is not authorised for
  does not fail visibly: the mail goes out and lands in spam.
- **Reply-to** — a mailbox somebody reads. People do reply.
- **Postal address** — required. A campaign without one is refused before
  it sends; anti-spam law in several countries demands it.
- **Footer line** — one sentence saying why people receive this.
- **Emails per batch** and **Seconds between batches** — lower these if your
  mail provider limits how fast you may send.
- **Track opens and clicks** — on by default. Off, reports show delivery
  only.
- **Accept signups from the site** — the signup form in the website's footer.
- **Hunter verifications per month** — see Verification, below.
- **Bounce webhook secret** — see Bounces, below.

Campaigns go out through the site's outgoing mail (chapter 18). Make sure a
test email from **System → Settings → Outgoing mail** arrives first.

## Subscribers

**Campaign → Subscribers** is the list. Each subscriber has an email address,
a name, a company, a status (active, unsubscribed, bounced…), groups, and —
for addresses found on the web — an industry, a location, a website and the
page they were found on.

Filter by status, group, industry or verification result; search by address,
name or company. **Export** downloads the list exactly as it is filtered on
screen, as a CSV file.

There are four ways to add people:

### One at a time, or a pasted list

**Add someone** takes one address. **Paste a list** takes a block of
addresses separated by new lines, commas or semicolons — `Name <address>` is
understood too. Anyone who has unsubscribed is skipped.

### From a file

1. Press **Import CSV or Excel** and choose a **CSV or Excel (.xlsx)** file.
2. Check **Which column is which** — the console guesses from the headings
   (Email, First name, Last name, Company, Phone, Industry, Location,
   Website). Correct any it got wrong.
3. Review the dry run: how many will be added, are already on the list, are
   repeated within the file, are not valid addresses, or unsubscribed before.
   Nothing is written yet.
4. Tick the groups under **Put them in** and press **Import … subscribers**.

Old binary Excel (`.xls`) files are refused — save as `.xlsx` or CSV first.

### From a mailbox

**From a mailbox** (on the Subscribers screen) reads the **To** and **Cc** lines of every message
in a mailbox over a date range you choose, and offers the addresses for
review. It never reads **From** lines (in an inbox those are mostly vendors
and automatic mail).

1. Choose the mailbox: a **Gmail, Google Workspace or Microsoft 365** mailbox
   (press Connect and sign in — this uses the OAuth client an administrator
   saved under Tickets → Email to ticket), or **Another mailbox over IMAP**
   (server details typed for this scan only and never stored).
2. Choose **Which messages** — all dates, the last 3/6/12 months, 2 years, or
   a range.
3. Press **Scan mailbox**. It runs in the background; you can leave the
   screen and come back.
4. **Review by domain.** Every domain found is listed with a count. Your own
   domains and bulk-sending services start unticked; role addresses such as
   `noreply@` are hidden behind a switch. Untick anything that should not be
   on your list.
5. Choose groups and import.

Junk, trash and drafts are skipped unless you tick **Include Junk, Trash and
Drafts**. The mailbox connection is
forgotten when the scan finishes. A finished scan that is not imported within
a day is discarded.

### From a website

**From a website** (on the Subscribers screen) reads a website — a trade directory, an
association's member list, a company's own site — and collects the names and
email addresses it publishes.

1. Enter the **Website address**, **How deep** to go (**0** — this page only,
   up to **4** levels of links) and **At most this many pages**.
2. Enter the **industry** (required) and optionally a **location**. Every
   address found is tagged with them, and at the review a group named after
   the industry is offered (ticked by default).
3. For a directory, tick **Also open each business's own website** to open
   each listed business's home page and up to three of its contact, about or
   team pages.
4. Optionally ask **Hunter** for addresses at the domains found (**Ask Hunter
   about this many domains** — needs a Hunter key; uses your Hunter search
   allowance).
5. Press **Crawl website**. The crawl reads politely — one page a second per site, obeying the
   site's robots rules — so a big directory takes a while.
6. Review by domain, as for a mailbox, and import.

### Existing customers

Your portal customers are kept in a group called **Existing customers**
automatically: an active customer joins it, and one who stops being active
leaves it (but keeps their subscription). You cannot edit or delete this group
by hand. Being a customer never puts back somebody who unsubscribed.

## Verification with Hunter

If an administrator saves a **Hunter.io API key** (System → Settings → API
keys), new addresses are checked a few at a time each night and tagged
*Verified*, *Risky*, *Invalid* or *Disposable*.

- **Invalid** and **disposable** addresses are left out of every campaign,
  but not added to the do-not-mail list — a check is a prediction, not a
  bounce.
- **Hunter verifications per month** (Campaign → Settings) is your plan's
  allowance. The nightly check spreads what is left over the rest of the
  month and never goes over. 0 pauses checking.
- **Verification** shows the breakdown, the allowance left, and the latest
  answers. You can re-check a single address from its row, which spends one
  of the month's checks.
- A wrong key or a used-up plan shows as a banner on this screen.

## Groups

**Campaign → Groups** holds named segments — "Customers in Kolkata",
"Webinar attendees". A subscriber can be in several. Campaigns are sent to
groups. Deleting a group keeps its subscribers.

## Campaigns

### Writing one

1. **Campaigns → New campaign.** Start from a **Blank** body or a template,
   give it a **Campaign name** (for you only) and a **Subject**, and press
   **Create and edit**. The campaign has four tabs: Content, Audience, Checks
   and Send.
2. Build the email from blocks: Header, Heading, Text, Image, Button,
   Product, Article, Two columns, Divider, Spacer, Footer. Pictures come from
   the media library.
3. Set the **subject** and, if needed, a different sender for this campaign
   (**Who it comes from**).
4. Optionally attach one file from the media library. Keep it under 2 MB —
   large attachments hurt delivery.
5. On the **Audience** tab, choose the groups under **Send to**, save, and
   press **Work out the recipients**. The screen shows how many **will
   receive it**, and who was left out and why (unsubscribed, bounced,
   failed the address check, on the do-not-mail list). Somebody in more than
   one group is counted once.

### Checking and testing

On the **Checks** tab, **Check this campaign** scores its chances of reaching
the inbox (out of 100) and lists what to fix. These problems **block
sending**: no unsubscribe link, no sender, no postal address, no plain-text
version, a link that is not a full `https://` address, almost no text (or too
little text for the pictures), and a message over about 100 KB (Gmail cuts
those off). The rest are warnings.

On the **Send** tab, **Send yourself a test** sends the real email to your own
address, or to another address you type. Tests are not counted in the
reports.

### Sending

Under **Send the campaign**, press **Send now**, or pick a time in **Or
schedule it** and press **Schedule**. Once it starts it cannot be recalled,
so test first. Delivery runs in the background in
batches; the screen shows progress, and warns if the site's scheduled tasks
are not running (in which case nothing will be delivered — see the
installation chapters).

A sent campaign cannot be edited. To send something similar again, use
**Duplicate** (on the list) or **Duplicate as new** (in the campaign), which
copies the wording and groups into a new draft.

### Testing two subject lines

**Test a second subject line**, on the Content tab, before sending:

1. Enter the **Alternative subject**.
2. Choose **Test on (% of the list)** (10–50%, half under each subject) and
   **Decide after (hours)** (1–72).
3. Send. The test group goes first; the rest wait.
4. After the wait, the subject with more opens is sent to everyone else. You
   can end the test early on the Send tab: **Decide by the numbers now**, or
   **Send A to the rest** / **Send B to the rest**.

### Resending to people who did not open

A few days after a campaign, **Resend to people who did not open** on its
report creates a copy with a **New subject** and, when you press **Resend
now**, sends it only to recipients who have not opened the original. Anybody who has since unsubscribed is left out. Each
campaign can be resent **once**.

### Reports

Each sent campaign's **report** shows delivered, opened, clicked, bounced,
failed, skipped and unsubscribed, with rates, and which links were clicked. Rates are shown
against delivered emails. Opens are approximate — many mail programs block the
tracking picture.

## Sequences

A **sequence** is a series of emails sent automatically, a set number of days
apart, to each person who joins — a welcome series, an onboarding course.

1. **Sequences → New sequence.** Name it and choose **Enrol when somebody**:
   joins a particular **group**, or subscribes at all.
2. Add **steps**. Each step is an email (edited like a campaign) with a delay
   in days after the previous one. Reorder steps with the arrows.
3. Press **Switch on** (it becomes *Active*). Every step must pass the same
   blocking health checks as a campaign.

- A person goes through a sequence **once**, ever.
- **Pause** holds everybody where they are.
- A subscriber who unsubscribes or bounces is taken out.
- You can also enrol people by hand, or a whole group, and cancel one person's
  enrolment.
- A sequence with people still in it cannot be deleted.
- The sequence's report shows each step's sent, opened and clicked.

## Templates

**Campaign → Templates** stores block layouts to start campaigns from. A
campaign made from a template is a copy; changing the template later does not
change campaigns already made.

## Unsubscribes and the do-not-mail list

Every campaign carries an unsubscribe link that works in one press, with no
login and no "are you sure". Mail programs' own unsubscribe buttons work too.

**Campaign → Unsubscribes** is the do-not-mail list. It is kept by email
address, so deleting and re-importing somebody does not put them back on the
list. Entries record why: unsubscribed, bounced, complained, or added by
staff.

- **Add an address** puts somebody on the list by hand.
- **Allow again** removes an entry you added, or a bounce you know is fixed.
- You **cannot** remove an unsubscribe or a complaint ("Only they can undo
  this"). Signing up again through the site's form does not bring them back
  either.

### Bounces

If you send through **Mailgun** or **Brevo**, they can tell your site about
hard bounces and complaints automatically, so those addresses are added to
the list at once:

1. An administrator sets a **Bounce webhook secret** (any long random text) in
   Campaign → Settings.
2. The Unsubscribes screen shows the webhook address for your provider.
3. In the provider's dashboard, add that address as a webhook for permanent
   failures and complaints (for Brevo, send the secret as the header the
   screen names; for Mailgun, use its webhook signing key as shown).

Temporary bounces (a full mailbox) are ignored — they are not a reason to drop
somebody for good. Without a secret, the webhook accepts nothing.

## Things to know

- A campaign cannot be recalled once it starts sending. Send yourself a test.
- The **postal address**, an unsubscribe link, a sender and a plain-text
  version are required, and sending is refused without them (see Checking
  and testing for the other blocking checks).
- Nothing is delivered unless the site's scheduled tasks are running; the
  campaign screen warns you when they are not.
- Unsubscribes and complaints cannot be lifted by staff.
- Importing addresses from a mailbox or a website does not mean those people
  agreed to hear from you. Make sure you have a lawful reason to email
  everyone you import, and review the domains carefully before committing.
- Sender addresses must be authorised for your domain (SPF and DKIM), or mail
  quietly lands in spam.
