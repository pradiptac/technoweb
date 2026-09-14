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
