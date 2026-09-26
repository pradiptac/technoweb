# The newsletter

Subscribers, groups, imports, campaigns, tracking, Hunter verification, bounces.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**"The test arrived and the campaign did not" is one thing and nothing else.**
A test send goes out **inside the request**; a campaign is sent by queued
`SendCampaignBatch` jobs. So with nothing draining the queue the test lands in
the inbox, the campaign sits at `sending` for ever, every recipient stays
`pending`, and **nothing is written anywhere** — no exception, no log line, no
`mail_error`, because a queued send cannot throw during the request. The screen
looks like a send in progress, which is exactly what it is minus the part that
does the sending.

On the server that is the scheduler’s cron entry. On a development machine it is
`php artisan schedule:work`, or `php artisan queue:work` to deliver at once.
`App\Support\QueueHealth` is shared by the settings screen and the campaign
report so both read one threshold, and the report warns when the oldest job is
over two minutes old — the age is the figure that matters, not the count: a
hundred jobs queued in the last ten seconds is a busy minute, one job sitting for
an hour is a broken deployment.

**A check must read what will be sent, not what was configured.** The
newsletter's postal-address check read the `newsletter_address` setting, and it
was wrong in both directions. It **passed** for a campaign whose footer had no
address — the footer is rendered when a campaign is *saved* and `html_content` is
stored, sending never re-renders, so filling the setting in afterwards turned the
check green while the message that went out still broke the law it exists to
satisfy. And it **failed** for a campaign whose footer block carried a perfectly
good address that nobody had also typed into Settings, which is the one somebody
actually hit: the console insisting an editor had not done the thing they had
just done, on a check that blocks sending. `HealthCheck` now resolves the address
the way `EmailRenderer` does — the campaign's own footer block, then the
configured one — and then requires it to appear in the rendered HTML. The
unsubscribe check beside it had always read the HTML; this is the same rule.

**`??` falls through on null and not on an empty string.** The footer block
stores `address => ''` for a field somebody left alone, so
`$b['address'] ?? $branding['address']` let a blank block beat the configured
address and the footer rendered with none at all. `?:` is what that wanted: the
block overrides where it *says* something.

**And `?:` reads its left operand, which `??` does not — so swapping one for
the other needs a `?? null` in front of it.** Making that change without one
turned every "create from a template" into **"Not created: Undefined array key
address"**: a shipped template's footer block carries a company and a line of
text and no address at all, so there was nothing on the left to evaluate. The
form is `($b['address'] ?? null) ?: ($branding['address'] ?? '')`, and the fix
for the empty-string bug is what caused this one.

**`newsletter_address` falls back to the site's `address`.** Two settings asked
for one fact under two names and only one was read, so a site with its postal
address on the Contact screen had a newsletter insisting there was no address
anywhere. The branding array already fell back from `newsletter_company` to
`company_name`; not doing the same for the address was the whole of it. All three
call sites go through `App\Support\Newsletter\Branding` now, because they had
already drifted apart once.

**The newsletter is `role:campaign_manager`, and it used to be a lie.** The
route block sat inside the `content_manager` group while the comment directly
above it and API.md both said `role:admin` — so anybody who could edit a blog
post could also mail the entire list, which is exactly what that comment argued
against. A comment is not a gate. The role is narrower than `content_manager`
rather than a superset of it: `NewsletterTest` asserts a campaign manager is
refused at `/admin/blog-posts`, because the point of splitting a role is what it
*cannot* reach.

**There is one way to get customers onto the list, and it is the standing
group.** A one-off "add all customers" button existed alongside it and is gone:
two paths to one outcome, where the second was correct on the day it was pressed
and quietly stale from the next approval onwards. What goes with it is the
ability to copy customers into an *arbitrary* group in one press — file them from
the group screen, or paste them.

**The newsletter is "Campaign" in the sidebar, and top level.** It sat inside
Site on the grounds that a fifth section for one module was too much — right
about the section, wrong about the depth. A campaign is something somebody sits
down to do, on its own schedule, the way Tickets and Customers are; buried beside
Sliders and Redirects it read as configuration. The **URL stays
`/admin/newsletter`**: renaming a route to match a label breaks every bookmark
and buys nothing.

**"Existing customers" is the one group nobody curates, and it must never
resurrect an unsubscribe.** `newsletter_groups.source = 'customers'` identifies
it — not the name or slug, which are editable — and `CustomerGroupSync`
recomputes its membership from the customer table on a `saved` hook and nightly.
Every addition goes through `SubscriberIntake`, which checks the suppression list
*before* the subscriber lookup, so somebody who left the list stays off it
however many times the sync runs. **The obvious implementation — write the
subscriber row and the pivot directly — passes every other test in the suite and
fails exactly that one**, which is why the test exercises all three routes back
in: the sweep, the hook, and a plain `touch()`.

Losing active status takes somebody out of the **group** and does nothing else:
a suspended account has not asked to stop hearing from the company, and deciding
that for them is not the sync's to make. Deleting the group or editing its
members is refused with a 422 *and* hidden in the console — both would appear to
work and be undone.

**The open pixel and the click links are API URLs; the unsubscribe link is a
frontend one.** All three were built from `config('app.frontend_url')`, and only
the third has a page behind it — `/newsletter/unsubscribe/[token]` is a real
Next route, while `/newsletter/open/…` and `/newsletter/click/…` exist **only**
on Laravel. So every campaign ever sent carried a pixel that answered 404 and a
set of links that answered 404. It surfaced as "I opened the email and it still
says 0%", and the worse half never surfaced at all: a reader clicking anything
in a delivered message landed on a missing page. `TrackingRewriter` now
generates both from the route table (`api.v1.newsletter.open` /
`.click`, so the `/api/v1` prefix cannot drift), which means **`APP_URL` has to
be the public API origin** — it is what those URLs are built on. The per-recipient
token goes through as a sentinel and is swapped back, because `route()`
percent-encodes `{{token}}`.

**A test that matched the URL against a pattern would have passed the whole
time.** The broken URL was perfectly well-formed; it just pointed at nothing.
`NewsletterTest::test_the_tracking_urls_resolve_to_routes_that_exist` **fetches**
what the rewriter generates and asserts the GIF, the redirect and the stamped
`opened_at`/`clicked_at`.

**Two screens must not hold two definitions of one word.** `delivered` on the
campaign list was written against `delivered_at` and the report counts a
recipient row at status `sent`. Nothing sets `delivered_at` — it needs a provider
webhook this deployment does not have — so the list reported 3 and the report
reported 4 for one send, one click apart, and whichever figure somebody quoted
was wrong somewhere else. Same argument as `TONE_BAR` being shared by the chart
and the badge.

**Subscriber addresses are verified through Hunter, and a verdict excludes
but never suppresses.** `App\Enums\EmailVerification::isSendable()` is the
one definition and three readers hold it — `NewsletterSubscriber::canReceive()`,
`AudienceResolver` (the send list and the `unverifiable_removed` preview count
from one expression) and `SendCampaignBatch`'s per-recipient re-check. Nothing
writes a Hunter result to `newsletter_suppressions`: that list records bounces
and decisions, and a prediction staff can overrule with Re-check is neither.
`webmail` is a real mailbox and maps to Verified, not Risky — an Indian SME
list is largely Gmail. `SubscriberVerifier::run()` never throws past its own
loop (the `Notifier::guard()` rule), reads Hunter's `/v2/account` before
spending and stops at `min(local remaining, Hunter available)`, counts every
200/202/222 against `hunter_monthly_cap` (Hunter bills a "still checking"),
and copies a verdict from the ledger for an address deleted and re-imported
rather than buying it twice. **Hunter's period is rolling from the day the
account was opened, not the calendar month** — the live account read "resets
2026-10-13" on the 13th — and the local count resets on the 1st; the `min()`
is what keeps that safe in both directions. **A transport failure burns no
attempt**: three
in a row stop the run, and none of them moves a row towards Risky.
`newsletter_verify_error` and `newsletter_verify_last_run` are settings the
verifier writes and `settings-form.tsx` hides (`HIDDEN`), the `mail_error`
pattern. The command exits 0 whatever Hunter does.

**The newsletter's seven screens joined both audit lists with the Verification
tab.** They were in neither — a module whose sidebar entry hides six screens
was six unaudited screens — and `campaigns/{id}/duplicate` was the third
endpoint in that module to ship with no control behind it (after Groups and
campaign delete). An endpoint with no button is a feature that does not exist.

**Deleting a campaign is offered in two places and they are not the same
control.** `DELETE /admin/newsletter/campaigns/{id}` and `deleteCampaignAction`
both existed for months with **nothing rendering a button**, so an old campaign
could not be removed from the console by any means — the same shape as Groups
being reachable from nowhere. The campaign's own screen has one in the sticky
footer, hidden while `status === "sending"` to match the API rather than trust
it. The list has one **per row, and only while that row carries no figures** —
`sent` is the same flag that decides whether the performance strip renders. A
list is the right place to clear out abandoned drafts, which is what the ask
was, and the wrong place for a one-press control that destroys a report: a sent
campaign is deleted from its own screen, where the dialog can say what goes
with it. The shared `campaign-deleted` toast therefore says "**any** report",
because the same key is used by both paths and a draft never had one.

**A bounce webhook fails closed, and the reason is the inverse of the payment
webhook's.** A forged payment callback marks an order paid; a forged *bounce*
callback **suppresses** addresses — anyone who found the URL could remove the
whole list from every future campaign, and nobody would notice until a send
reported an audience of nothing. So `newsletter_webhook_secret` is required and
the endpoint is inert without one. Mailgun's HMAC is over `timestamp . token`
with the **webhook signing key**, a different secret from the API key, inside a
15-minute window so a captured delivery cannot be replayed; Brevo signs nothing
and sends the secret in a header. **Only permanent failures and complaints
suppress** — a soft bounce is a full mailbox or an hour of downtime, and
suppressing on one removes a real customer for good.

**The newsletter's one rule is the suppression list, and it is keyed on the
address.** `newsletter_suppressions` outlives every subscriber row, so deleting
somebody and re-importing them from a spreadsheet cannot resurrect a
subscription they withdrew. `SubscriberIntake` is the only way onto the list
and checks it **before** looking the subscriber up — a suppressed person keeps
their row, so asking the row first lets an import quietly reactivate them.
`AudienceResolver` is the read half and asks the same list. Staff may lift a
hard bounce and may **not** lift an unsubscribe: one is a fact about a mailbox,
the other is somebody's decision.

**`whereIn('id', <select id join pivot>)` returns a subscriber in two groups
twice.** `IN` is a set-membership test that cannot duplicate — and MySQL is free
to flatten it into a semi-join, where the pivot's duplicate rows survive.
Measured as `rows=3 ids=3,3,4`, which is a person receiving one campaign twice.
The audience is a `whereExists` predicate on the outer row, which cannot express
the duplicate. Reverting it fails exactly its own test.

**`SendCampaignBatch` carries a `$timeout` of 80** (2026-09-21). It had none,
so the worker's 60s default bounded a loop over up to a thousand sends, and a
batch killed at that limit left its remaining recipients `pending` with
`$tries` 1 saying nothing would come back for them. Eighty is under the
database queue's `retry_after` of 90, the rule every other job follows.

**A campaign is claimed with a conditional UPDATE, not a read-then-write.** Two
requests both reading `ready` both send, and there is no unsend — the same shape
as `SignInCodes::consume()`. Recipients also carry a unique index per campaign,
and each batch re-reads the recipient's status immediately before sending, so
somebody who unsubscribes during a long send does not get the rest of it.

**The email renderer is tables and inline styles, and that is not nostalgia.**
Outlook renders with Word's HTML engine — no flex, no grid, no reliable
`<style>` — and Gmail strips `<head>`. The one `@media` block only *narrows* a
layout that already reads at full width, so a client that drops it shows the
desktop version rather than a broken one. `{{unsubscribe_url}}` is a
placeholder filled per recipient and the health check refuses a campaign whose
HTML lacks it.

**The deliverability score is a heuristic and says so**, scored out of the
checks that *apply* — the rule `SeoScore` follows. Nothing here can see the
sending domain's reputation, which matters more than everything it can see. The
legal checks (unsubscribe link, sender identity, postal address, text part) are
**blocking**, reported separately from the number, and re-run on the server at
the moment of sending rather than read from a stored score.

**CSV is hostile in both directions.** Read: strip the BOM, sniff the encoding
and the delimiter — a German Excel exports semicolons, and assuming commas
reports every row invalid. Write: escape any cell starting `=`, `+`, `-` or `@`,
because Excel executes it and an export is a file somebody opens in Excel. The
import is a **dry run then a commit**: reporting afterwards means the moment
somebody notices they mapped Company onto the surname column is the moment after
twelve hundred rows were written.

**An audience arrives three ways, and all three go through `SubscriberIntake`.** A spreadsheet, the portal customer list, and a pasted block of addresses. The paste takes what a paste actually looks like — one per line, or comma- or semicolon-separated, and `Name <address>` as a mail client writes it, keeping the name — because the alternative is telling somebody with eleven addresses to fill a four-field form eleven times. It is **split on separators, not scanned with one email-shaped regex**: scanning finds addresses inside words and inside URLs, and an importer that invents recipients is worse than one that misses a malformed line somebody can see.

**`.xlsx` is read without a library and without `ext-zip`.** `phpoffice/phpspreadsheet` is tens of megabytes to answer one question, and `ZipArchive` is not compiled in on this development machine — an import that works on one deployment and says "please save as CSV" on another is worse than one that simply works. `App\Support\Newsletter\Xlsx` reads the ZIP central directory itself and inflates with `gzinflate`, which is zlib and is effectively universal. The legacy binary `.xls` is a different format entirely and is **named and refused**, because parsed as text it yields one unreadable column and several thousand "invalid address" rows.

**A spreadsheet cell is positioned by its `r=` reference, never by counting.** A row with an empty column simply omits that `<c>` element, so `A,C` arrives as two cells and a reader that appends them in order shifts everything left from the gap — the company column silently becomes the first-name column for some rows and not others. That is not a crash, it is bad data, and it is what the gap test in `NewsletterTest` exists for.

**`mimes:` is worse than useless for a spreadsheet.** It validates the extension *guessed from the MIME type*, and an xlsx is a zip — so whether a real workbook passes depends on how complete the server's magic database is, and a file that imports on one machine and is refused on another is the worst kind of rule. `extensions:` on the name plus a magic-byte check on the contents, which is stronger than either. The careers form's `mimes` + `mimetypes` pairing still stands where the type is a real one.

**A template's blocks are copied server-side from the template id.** The gallery
omits `blocks` deliberately — ten templates at six kilobytes each is sixty to
draw a grid of names — so a browser asked to post them back has nothing to post,
and the campaign arrives empty with nothing saying so. Copied rather than
referenced: editing a template must not rewrite a campaign already written, and
a sent campaign is immutable.

**Only `newsletter_signup_enabled` is published from the `newsletter` group.**
The public whitelist is by group, which is the right default — but that group
also holds the from-address and the batch sizes, and the site needs exactly one
fact from it: whether to draw the signup form. Named explicitly in
`ContentController::settings()` so it stays one considered exception rather than
a second whitelist that grows.

## Importing from a mailbox (2026-09-19)

**A scan ends as a file, so review and commit are the CSV import's own.** The
mailbox scan (`App\Jobs\ScanMailboxForSubscribers` → `MailboxHarvester` →
`HarvestState::writeCsv()`) writes `newsletter-imports/mailbox-{id}.csv` on the
private disk with `email, first_name, last_name, display_name, domain,
occurrences, sent_to, first_seen, last_seen, folders`, runs
`CsvImporter::dryRun()` on it into the row's `analysis` column, and stops.
Committing is `POST newsletter/imports` with `import_id` — the same
`CsvImporter::run()`, the same `SubscriberIntake::take()` (source `mailbox`),
the same `NewsletterImport` ledger and groups. A second door onto one pipeline,
not a second pipeline.

**A scan is sliced, because the drain is `--max-time=50` and `retry_after` is
90.** The scheduler runs `queue:work --stop-when-empty --max-time=50` once a
minute, and the database queue hands a job to a second worker after ninety
seconds. A twenty-minute job would be killed by the first and duplicated by
the second. So one job does forty seconds of work (`BUDGET_SECONDS`), saves
where it got to — `HarvestState`, a JSON file beside the CSV: folders and how
each was classified, a cursor of folder index and last UID, the Message-IDs
seen, the addresses with names and counts — and dispatches itself again;
`$timeout` is 80. The screen polls the row and draws `progress`. A scan is
refused before it starts when `QueueHealth::delivering()` is false, with the
crontab line, because a row that sits at `pending` for ever is worse than a
refusal.

**To and Cc in every folder, From nowhere.** In Sent, From is us. In the
Inbox, From is whoever writes *to* us — vendors, notifications, mailing lists —
the audience that never asked to hear from this company and the one most
likely to complain. The client's brief was To and Cc; `include_from` is the
obvious follow-up switch if it is ever asked for.

**Folders are read by flag first, name second** (`FolderPolicy`). SPECIAL-USE
flags are how Gmail and Microsoft 365 say what a folder is whatever it is
called — Outlook localises "Sent Items". Gmail's `[Gmail]/All Mail` (`\All`)
is every message again and is never read; a message is also deduped by
Message-ID, because a Gmail label files one message under two folders. Junk,
trash and drafts are skipped by default (spam's recipients are harvested or
forged, deleted mail was deleted on purpose, a draft's recipients may never
have been written to) and come back with `include_junk`; Microsoft 365's
Calendar, Contacts, Tasks, Notes, Journal and Sync Issues hold no mail and
never do.

**The date range is asked of the server and checked again on the way in.**
`SINCE`/`BEFORE` go into the one SEARCH that names the set (BEFORE is
exclusive, so `until` becomes the next day); `MailboxHarvester` then drops a
row whose Date header falls outside the window, for the servers that ignore
the search terms. A message with no Date is kept.

**Headers only, two hundred UIDs a FETCH.** `ImapMailbox::scanHeaders()` asks
for `RFC822.HEADER` and nothing else; a body is never pulled. `folders()`
reads the raw LIST flags off the protocol, because webklex's `Folder` drops
them, and counts with `STATUS (MESSAGES)`, falling back to EXAMINE and then
to "unknown" (`-1`, drawn as a dash) — a server without STATUS gets a
folder-count progress bar instead of a message-count one.

**The consent is spent by the scan and forgotten.** `OAuthConnection::newsletter()`
is a slot of its own — prefix `newsletter_oauth_`, cache `newsletter-oauth-*`,
error row `newsletter_oauth_error` — that *borrows* the app registration saved
under Tickets → Email to ticket through `credentialsPrefix: 'inbound_oauth_'`: one
OAuth client with three callback addresses, rather than three clients. A state
minted here cannot be spent at either Settings callback and theirs cannot be
spent here (`NewsletterMailboxImportTest`). The job's `finally` calls
`MailboxImport::forgetConsent()` whenever the scan stops being `scanning` —
finished, failed, discarded — because the mailbox is not needed once the
addresses are collected. The five `newsletter_oauth_*` rows are in `HIDDEN` on
the settings screen; nobody types them.

**One-off IMAP credentials are sealed in the cache, never a row, never a
payload.** Every slice needs the password, so it cannot be read-and-forgotten
by one job; a failed job's payload is copied verbatim into `failed_jobs`, so
it cannot ride there; and `CACHE_STORE=file`, so it cannot sit in the cache in
clear. `ScanCredentials` stores `Crypt::encryptString(json)` under
`newsletter-scan:{import}:{16 random bytes}` for six hours, the key alone in
the job, and forgets it in the job's `finally`. The test decrypts the cached
value to prove it is the password and asserts the serialised job does not
contain it.

**The review is the reviewer's.** `dryRun()` now reports `domains[]` — every
domain with its count, the count that would be added, a sample, and a `kind`:
`own` (the domains of every address this installation sends as, every staff
account, the scanned account, and the site's own hosts — **minus the freemail
providers**, or a Gmail mailbox would untick every Gmail contact) or
`machine` (`bounces.`, `notifications.`, `amazonses.com`, `sendgrid.net`…).
Those two start unticked; everything else ticked. Role addresses
(`AddressKinds::ROLE_LOCAL_PARTS` — `MailFilter::ROBOT_SENDERS` plus
`abuse`, `hostmaster`, `root`… and deliberately **not** `info`, `sales` or
`support`, which on this list are the customer) are counted and offered
behind a switch, off by default. On commit `CsvImporter::run()` counts an
unticked domain's rows and the excluded roles as `excluded` and writes no
`NewsletterImportRow` for them: a decision, not four thousand problems.

**Duplicates are caught three times, all in the pipeline that already
existed.** Within a scan by the harvester's address map (and by Message-ID
across labels); against the list at review (`already_subscribed`) and at
intake (`DUPLICATE`, or `UPDATED` when a second mailbox supplies a name the
first did not); and against the suppression list before anything else, which
is why an unsubscribed address in a scanned mailbox is reported and never
re-added.

**`dryRun()` asks the database in batches.** It used to run an `exists()` per
row — fine for a spreadsheet, twenty thousand queries for a mailbox. It
gathers the addresses first and asks `newsletter_suppressions` and
`newsletter_subscribers` a thousand at a time; the CSV wizard gets the same
speed for free and its output is unchanged apart from the two new blocks.

**Stuck and stale scans are pruned hourly.** `technoware:prune-newsletter-scans`
marks a `ready` result past its day `expired` and deletes the file, and marks
a `pending`/`scanning` row untouched for two hours `failed` with its
credentials and consent forgotten — a worker killed mid-chain would otherwise
leave the screen waiting on a scan nothing is running.

**Known limits, written down.** Whoever holds a campaign manager session may
point a scan at any IMAP host (`validate_cert` on, port bounded) — the same
exposure the Ticketing panel gives an administrator. Microsoft 365 shared
mailboxes are out of scope; a licensed mailbox is what the consent connects. A
scan stops taking new addresses at `Csv::MAX_ROWS` (50,000) and says
`capped`; narrow the range. On a `sync` queue (a developer machine without
`queue:work`) a scan runs inside the request; use `queue:work`, as campaigns
already need. `ImapMailbox::folders()`/`scanHeaders()` are, like the ticket
piper's adapter, not unit-tested — `FakeMailboxScanner` drives everything
above them.

**A/B subject testing (2026-09-20).** A campaign carries `subject_b`,
`ab_test_percent` (10–50) and `ab_wait_hours` (1–72). On send, after the
audience is frozen, `CampaignSender::splitForTest()` marks a slice — the
share of the list, at least two — with `variant` `a`/`b` alternating down
the list, and sets every other recipient to status **`held`**, which
`dispatchPending()` never queues and `completeIfDone()` counts as not done.
`CampaignMessage` reads `subjectFor($recipient->variant)`. The decision is
`CampaignSender::decide()`: opens over sent per variant, a tie to A, stamped
with the same conditional update the first send relies on so the scheduler
(`technoware:decide-subject-tests`, every ten minutes, once
`abDecideAt()` — start plus the wait — is past) and the console's "Decide
now" cannot both win; the held rows become `pending` under the winner and
are dispatched. A campaign under test is still `sending`, which is the
truth. `NewsletterTest` drives the whole path: three sent, three held, B
opened, the command declines before the wait and decides after it, the
released three mailed with the second subject, the campaign completes, the
report says B.

## Resending to non-openers (2026-09-20)

**A resend is a campaign, and the copy goes through the one copy mechanism.**
`POST /admin/newsletter/campaigns/{id}/resend {subject}` on a `sent` campaign
makes a fresh row through `NewsletterCampaign::replicateAsDraft()` — the same
method `duplicate` now calls, so the two cannot drift about what a copy
carries — names it "<name> — resend", gives it the new subject and no
`subject_b` (a second attempt is not an experiment), and points it home
through `resend_of_id`. It has a report, a health score and tracking of its
own, which is the whole argument for it being a row rather than a flag.

**Its audience is the original's non-openers re-filtered, never the groups.**
The recipients at status `sent` with no `opened_at` are handed to
`AudienceResolver::freezeFrom()`, which applies the *same* expression
`eligible()` applies — `sendable()` is one private method both call — so
somebody who unsubscribed, bounced or was suppressed between the two sends is
dropped, and the per-recipient check in `SendCampaignBatch` catches whoever
leaves after that. `CampaignSender::queue($campaign, recipientsFrozen: true)`
then skips freezing from the groups. A flag rather than "notice existing
rows", deliberately: the claim stays the first write `queue()` makes, so two
requests still cannot both win it, and a campaign that somehow carries stale
rows is not silently sent to them because a count came back non-zero.

**The health gate applies, before anything is written.** The copy is built in
memory, `HealthCheck::run()` on it, and a blocking failure is the same 422
with `errors.health` that `send` answers — a campaign sent before the postal
address was configured cannot be resent breaking the rule the first send
should have been stopped by. The copy is saved only once every refusal has
had its chance.

**Once per campaign, and the guard is the unique index.** `resend_of_id` is
unique, so a second press — or two at once — is refused by the database
whatever the controller read a moment earlier; the `UniqueConstraintViolation`
is caught and answered with the same sentence as the check above. MySQL
allows any number of nulls in a unique column, so every ordinary campaign is
unaffected.

**A copy carries the message, never the tracking.** A sent campaign's stored
HTML has been through `TrackingRewriter::prepare()`: every link points at
*that* campaign's click rows and the open pixel is in it. Copied as-is —
which `duplicate` did for months — the copy's clicks would be counted
against the original, and a second `prepare()` would leave the links alone
(they already point at the tracker) and add a second pixel.
`TrackingRewriter::unprepare()` puts each click URL back to its destination
by the link id and removes the pixel; `replicateAsDraft()` calls it, and
`queue()` prepares the copy afresh on rows of its own. The pixel is also
idempotent now — `prepare()` adds none when one is present.

**The panel has two states and no third.** On a sent campaign's report the
console offers "Resend to people who did not open" with the report's
`counts.non_openers` (delivered and never opened — an upper bound, since
eligibility takes its share on the server), a subject field starting as the
original's line, and Send; once a resend exists the panel links to its report
instead, and the resend's own report names its parent. The action redirects
to the resend's report with `?done=campaign-resent`, because a confirmation
left on the original's screen would be a toast about a different campaign.

## Sequences (2026-09-20)

**Each step is a `newsletter_campaigns` row, and that is the whole design.**
A step carries `sequence_id`, `sequence_position`, `delay_days` and the
status `automation` (`CampaignStatus::Automation`), so it has the block
editor, the health checks, `TrackingRewriter`, the unsubscribe footer,
`CampaignMessage` and a report without a second implementation of any of
them — a `sequence_steps` table would have been a second newsletter, and
this module has already been bitten by two screens holding two definitions
of one word. A step send is an ordinary recipient row on that campaign,
accumulating over time rather than frozen once; the recipient index (one
row per subscriber per campaign) is what makes one person get one step
once whatever the runner does twice. What the rest of the module had to
learn is to refuse a step as a campaign: `queue()` answers with a sentence,
`completeIfDone()` returns early (it is never done), the campaigns index and
the dashboard's totals leave `automation` out, the campaign `PATCH` accepts
content and refuses `status`, `group_ids`, `scheduled_at` and the
subject-test fields, and the campaign `DELETE` sends you to the sequence.

**A subscriber goes through a sequence once, ever.** `newsletter_sequence_enrolments`
is unique per (sequence, subscriber), and `Sequences::enrol()` answers
`already_enrolled` rather than starting again; a race on the index is caught
and answers the same. Re-joining the trigger group, being re-imported from a
spreadsheet, being enrolled by hand a second time — none of them restarts a
welcome series, because the alternative is somebody receiving "Welcome to
Technoware" for the third time in a year and reporting it as spam. The
step campaigns' recipient index says the same thing one level down.
`SubscriberIntake::take()` hooks are on the outcome, not the call: a *new*
row triggers the group-less sequences (`onActivated`), and only the groups
`syncWithoutDetaching` actually **attached** trigger the group sequences
(`onJoined`) — an import that names a group somebody is already in is not
a join. The group screen's bulk add calls the same hook with the attached
ids. Both are guarded so a sequence can never fail the intake that called
it: the subscriber was added, and an enrolment that could not be written is
a log line, not a refused import.

**Enrolment is refused for the same reasons a send is.** Only an active
subscriber not on the suppression list; a bounced or unsubscribed one
answers `not_active`, a suppressed one `suppressed`, and a sequence with no
steps `no_steps` — an enrolment with nowhere to go would sit `active` for
ever and read on the console as somebody waiting. The manual endpoint takes
ids, a group or pasted addresses (resolved on the server, with `unknown` for
an address that is not on the list at all) and answers a count per outcome,
because the refused ones are the interesting ones.

**The runner is the scheduler, not a listener.** Nothing sends at the moment
of enrolment. `technoware:run-sequences` runs every ten minutes beside
`decide-subject-tests`, and `Sequences::run()` takes every active enrolment
past its `next_at` in an active sequence, in chunks: a subscriber who is
gone, no longer active or suppressed is **cancelled with the reason** and
gets no row; otherwise a recipient row is written on the step campaign (the
shape `AudienceResolver` writes, the model minting the tracking token) and
the cursor moves to the next step's position and `now + its delay_days`, or
to `completed` after the last. The rows are dispatched per step in batches
of `CampaignSender::batchSize()` through the same `SendCampaignBatch` a
campaign uses — which is the whole argument for a scheduler over a
listener: a step with a delay of zero goes out within ten minutes of
joining rather than inside the request that joined, SMTP stays off the
request path, a paused sequence is one status rather than a queue to drain,
and every send passes the job's own suppression, verification and
hard-bounce handling. The cursor is a *position*, not a step id: remove a
step and the rest are renumbered, and whoever was due position 2 gets
whatever is second now; past the end, the runner completes them.

**A step is prepared on save, on activation and again before it is used.**
A campaign is prepared once by `queue()` at the moment it is sent; a step is
sent a person at a time for months, so `Sequences::prepare()` runs
`TrackingRewriter::prepare()` and stores the result when the campaign
controller saves a step, when the sequence is switched on, and in the runner
before a step's first row of the run — idempotently, because the rewriter
leaves a link already pointing at the tracker alone and, since this change,
adds no second pixel. `HealthCheck` strips the pixel before counting images,
or a short step with its pixel in it scored as "mostly picture".

**Switching a sequence on is the send gate, and a failing step is held.**
`PATCH status=active` runs `HealthCheck` on every step and refuses with
`errors.health` naming the step — the moment that corresponds to a
campaign's send. Because a step can be edited while the sequence runs, the
runner checks again per step per run, and a step failing a blocking check
is **held** rather than sent: its enrolments are left where they are, the
tally says `held`, and the Steps tab shows the score. A step that would be
refused as a campaign is not sent as a step either.

**The sender lives on the sequence and is copied onto every step.**
`CampaignMessage` reads the From off the campaign row, so the sequence's
`from_name`, `from_email` and `reply_to` are written onto each step at
creation and on every sequence save; the campaign editor shows the fields
disabled on a step and says where they live. A series that changes its
sender halfway through reads as two senders.

**Deleting is refused while anybody is still enrolled.** An active enrolment
is a promise of messages to come, and deleting it silently is how somebody
told to expect a series gets half of one. Pause it, or cancel the
enrolments, then delete; the steps cascade with the sequence (a step has no
meaning without it) and the subscribers are untouched. A cancelled
enrolment never goes back to `active` — it is the record that they were not
to be mailed.

**The console.** `Sequences` in the newsletter strip; the list (trigger,
steps, enrolled, status); `/new` (born paused, landing on the Steps tab,
since a sequence with no steps enrols nobody and that is the next thing to
do); and one screen of four tabs — Settings, Steps (a `ReorderButtons` row
per step with its cumulative "Day N", the delay as a select saved on
change, "Edit content" into the campaign editor, remove), Enrolments (the
counts, a group-or-addresses enrol form, one page of people with a status
filter and Cancel) and Report (per step sent/opened/clicked, rates over
sent). The campaign editor opened on a step shows "Step N of <sequence>",
goes back to the sequence, and drops the Audience and Send tabs — the panels
too, because `Tabs` reads its children by position. `NewsletterSubscriber`
gained `status` in its in-memory defaults on the way: `enrol()` asks a row
created and enrolled in one breath, and the column's default is not on the
model until it is re-read — null there read as "not active" and enrolled
nobody, the trap `StoreProduct` records for `track_stock`.

## Hardening from the 2026-09-26 review

- **A bounce delivery is accepted once.** Mailgun's `token` is random per
  delivery; after the signature passes, it is remembered with `Cache::add`
  for thirty minutes (twice the replay window), so a captured delivery posted
  again straight after staff lift the suppression it caused changes nothing.
- **The CSV writer and reader speak RFC 4180** (`escape: ''`). With PHP's
  backslash escape, `Bob\",=HYPERLINK(…)` was one field to PHP and two cells
  to Excel — a formula cell `Csv::escape()` never saw. `HarvestState` writes
  and `Csv::read` reads with the same setting. `tests/Unit/CsvFormulaTest`.
- **An xlsx part inflates to at most 50MB** (`Xlsx::MAX_INFLATED_BYTES`), and
  a cell reference past column XFD is skipped rather than padded out to.
  `tests/Unit/XlsxLimitsTest`.
- **A mailbox scan is not a port scanner.** A typed IMAP source is port 143
  or 993 on a public host (`PublicHost`), and a failed one-off scan shows one
  sentence rather than the socket's words; the log keeps those.
- **The import commit takes a file name** — see `docs/store.md`,
  `ImportUpload`.

