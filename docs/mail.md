# Outgoing mail

The queue, the scheduler, transports chosen in Settings, email templates, acknowledgements.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**Mail leaves through the queue, and the three exceptions are deliberate.**
That five-second SMTP timeout in `config/mail.php` was a floor under the
failure, never a fix — an unreachable host took a contact-form submission from
0.2s to **12.5 seconds**, long enough for a visitor to press Send twice and for
a handful of concurrent submissions to occupy every PHP worker there is. Eleven
notifications now carry `App\Notifications\Concerns\QueuedMail` and
`implements ShouldQueue`; **`use Queueable` alone queues nothing**, which is
why every notification here carried that trait for months and every one of them
was still sent inline.

`SignInCodeIssued`, `ResetPassword` and `VerifyCustomerEmail` stay
**synchronous**, and each says so in its own file, because an unqueued
notification now reads as an oversight. Somebody is sitting at a form waiting
for that exact message; the queue is drained once a minute, and a six-digit
code that takes a minute is a sign-in nobody can use. The cost is that the
timing side-channel `SignInCodes` documents stays open on that one route.

**A queued failure is silent, and that is the trap the move introduces.**
`Notifier::guard()` catches a send that throws — but a queued notification only
*dispatches* during the request, so the guard has nothing to catch and a dead
mail server yields a console that looks perfectly healthy while every receipt
stops. `QueuedMail::failed()` writes `mail_error`, the same banner a failed
test writes, so the operator's path back to health is unchanged.

**The queue is drained by the scheduler, not a daemon.** `queue:work
--stop-when-empty --max-time=50` every minute, `withoutOverlapping`. The
scheduler is the only background process this deployment is known to have and
four commands already depend on it; asking for a supervised worker as well is a
second operational requirement, and mail that silently stops because nobody set
it up is worse than mail that is a minute late. A short-lived worker also
**re-boots each run**, which matters here: mail is configured in the console and
`MailSettingsProvider` applies it at boot, so a daemon would hold the settings
it started with and a changed SMTP password would apply to web requests and not
to the queue.

**An empty queue is not evidence that anything is running, so the scheduler
keeps a pulse.** `pending: 0` is what a healthy install looks like and what an
install with no cron entry looks like, right up until somebody presses Send —
and the screen that most needs the answer is the one *before* the send, where
there is nothing yet to be late. `routes/console.php` renews
`scheduler_heartbeat` in the cache every minute, `QueueHealth::scheduler()`
reads its age, and the campaign send screen renders either "the scheduler last
ran 12 seconds ago" or the crontab line to add. A heartbeat that has **never**
existed reports as stopped rather than unknown: on a deployment with no cron
entry there is nothing further to wait for, and the fix is the same line either
way. The one honest false alarm is the first minute after a deploy, and the
panel says so. A persistent `CACHE_STORE` — `file`, `database`, `redis` — is
what makes the key outlive a request; on an `array` store this degrades to
"cannot tell" rather than lying. **The shipped store is `file`, not
`database`**: on the database store every `Cache::get` is a MySQL query, and
the settings map, the rate limiter and this heartbeat are all read on ordinary
requests. `FileStore` has the same atomic `add()` and `lock()` the scheduler's
`withoutOverlapping` and `MailOAuth`'s refresh lock rely on; what it needs is
the queue worker and the web process sharing `storage/framework/cache`, which
under Plesk they do.

**`MailSettingsProvider` applies when `mail.manager` is resolved, not at
boot.** A public `GET /solutions` never sends anything and used to configure
the mailer anyway. `Mail::extend()` lives inside the same `resolving` callback,
because the facade resolves the manager to register a driver and would have
defeated the deferral; and if the manager is already resolved when the provider
boots — a test re-booting it — it applies at once, since a callback registered
after the fact never fires. The one reader of `config('mail.from')` that can run
before a mailer exists is `Notifier::route()`'s last-resort fallback, which now
reads the setting directly.

**And the scheduler is not the only right answer, which the first cut got
wrong.** A bare `php artisan queue:work` — by hand in development, under
supervisor on a server — delivers mail perfectly well and touches the
scheduler's heartbeat not at all, so a panel that knew only about the scheduler
told somebody with a worker running that **nothing** was delivering, and sent
them to fix a cron entry they did not need. That was reported within minutes of
it shipping. A worker now writes its own pulse from inside the process that
sends, on `Queue::looping` in `AppServiceProvider` — the event fires on every
poll, so it is throttled on a **static** rather than by reading the cache
first, or it is a database round trip a second for a fact that changes once a
minute. `delivering` is either pulse; the panel says which, because "it is
running" and "how" are different questions and only the second is any use on
the morning it stops. **A worker started before a deploy is running the old
code and reports nothing** — restart it.

**A test for that must set `queue.default` to `database`.** `phpunit.xml` pins
`sync`, and `QueueHealth::read()` returns early for a driver it cannot inspect —
so assertions about the scheduler passed against the early return and proved
nothing about the branch every deployment runs. Deleting the scheduler from the
database branch was invisible to the test until it said `config([...])` out loud.

**If nothing is draining the queue, the send happens during the request
instead.** `Notifier::dispatch()` asks `QueueHealth::delivering()` and calls
`sendNow` when the answer is no. Queueing is an optimisation, and this is what
stops it losing the message — the failure below is not hypothetical: a contact
form on this install sent no email for **two days** while ten jobs sat in the
table, and the first sign of it was somebody asking why.

The cost is that an idle queue puts the SMTP round trip back on the request —
up to the measured 12.5s against an unreachable host, despite `MAIL_TIMEOUT=5`.
That is the worse of two costs only while the alternative is a message nobody
ever receives, and `Notifier` still swallows, so a slow send cannot break what
the caller committed.

**Three things about that rule are load-bearing.** `delivering()` is the
*existing* definition, true for either pulse — the scheduler's heartbeat or a
bare `queue:work` writing its own — rather than a second threshold invented
here. **`sync` counts as draining**, because on that connection Laravel
delivers inline and `delivering()` reads only heartbeats, so it would otherwise
answer false about a connection with nothing wrong with it. And the answer is
memoised in the **container**, not a static: a static survives the whole PHP
process, so the second test in a file would read the first one's answer.

**`sendNow` runs no job, so `QueuedMail::failed()` never fires — and
`Notifier::guard()` writes `mail_error` for that reason.** Without that line,
making delivery synchronous would have silently deleted the one signal that
survives a swallowed failure: `mail_error` is what the settings screen renders
as a banner and what a successful test send clears. It closes the same hole for
the three always-synchronous notifications, where a failed sign-in code used to
write nothing at all.

**Campaigns are exempt structurally, not by remembering.** They go out as
`SendCampaignBatch` jobs through `Mail::to()->send()` and never touch
`Notifier`, so no idle queue can put thousands of recipients on a request path
— and their batches are deliberately spaced to keep the relay happy, which an
immediate send would defeat. `QueuedMailTest` pins it.

**A system email can be switched off, copied and re-addressed per message,
and the three decisions live beside the wording without being it.**
`mail_templates` carries `sends`, `cc`, `bcc`, `from_name` and `from_email`
beside the wording columns. **`sends` is not `is_enabled`, and the two must
never be confused**: `is_enabled` was there first and means "use my wording"
— false puts the built-in text back and the message still goes; `sends` means
"send this message at all". The console labels them as two sentences on two
parts of the form for that reason.

**The delivery switch is `shouldSend()` on the `Templated` trait, and nowhere
else.** Laravel's sender and its `NotificationFake` both ask it before
delivering, and they ask at *delivery* — so a queued receipt reads the switch
when the worker runs, not when the order was placed, and `Notification::fake()`
tests see the skip. A check inside `Notifier` would be visible to neither.
It is on the trait rather than on each class for a second reason:
`MailTemplateTest` slices every notification's source between `templateData(`
and `defaultMail(` to check its placeholders, and a method landing between the
two would end up inside that slice.

**Copies and the sender are applied before the wording's early return.**
`Templates::apply()` used to read the row inside the wording branch; a row
with the built-in text and an archive BCC would have carried no BCC, and
resetting the words would have silently dropped every address. It reads once
and everything derives from it. A BCC never appears in the message — it is an
envelope recipient — so the log transport cannot show one; `Cc:` can, which is
what the browser probe reads, and `MailTemplateTest` pins BCC on the message
object.

**Three messages are locked, and the flag lives in the catalogue.**
`verify_customer_email`, `reset_password` and `sign_in_code_issued` each carry
a credential somebody is waiting for with no other way in: switching one off
locks people out, and a CC on one sends a sign-in code to a second inbox. The
lock is a validation rule in `EmailTemplateController::update()` — the place
every other lock in this console lives — and `locked` rides on every catalogue
entry so the console disables the controls from the API's answer rather than
from its own list of three keys. Their wording and sender stay editable.

**"Use this wording" could never be turned off from the console, and the fix
for that was wrong the first time too.** An unticked checkbox posts nothing,
and `actions.ts` read `get("is_enabled") !== "off"` — `null !== "off"` is true,
so the box saved as on however it was set. The fix is a hidden input of the
same name carrying `"0"` before each checkbox, so the key is always posted —
and **`getAll(k).at(-1)`, not `get(k)`**: PHP and Rails take the last value of
a repeated field, `FormData.get` returns the *first*, which is the hidden `"0"`
every time. The first cut read `get` and saved both switches off however they
were set, and a probe reading the box back agreed with it, because the box
showed what had been saved. Found by posting a contact form and reading the
mail log rather than the form.

**Reset clears the wording and keeps the decisions**, so `is_customised` now
means "wording has been written" rather than "a row exists" — a row can be a
switch and two lists over the built-in text. `destroy()` nulls the wording
columns and deletes the row only when nothing else is set.

**Every enquiry now acknowledges the person who sent it**, which nothing did
before. The desk was told and the sender got an on-screen sentence and no
email, so somebody who mistyped their address discovered it days later when a
reply bounced — having spent that time believing they had been in touch. A
ticket has acknowledged since it shipped; enquiries and editor-built forms
never grew the second half. `EnquiryAcknowledged` and `FormAcknowledged`,
both editable at `/admin/settings/email-templates` like the other 23 — and,
like all 25, switchable off, copied and re-addressed from the same screen.

**The recipient is found by field *kind*, never by name.**
`Form::submitterEmail()` takes the first field whose kind is `email` and
validates it. **Not `$lead->email`**: `LeadIntake` guesses the contact columns
from likely key names, so a field called `contact_email` produces a lead with no
address — right for a pipeline record that degrades to "answers attached, no
contact columns", and wrong for a recipient, where the failure is silence. A
form that asks for no address acknowledges nobody, which `Notifier::to()`
already handles by treating null as no recipient.

**Neither acknowledgement echoes the submission back, deliberately.** They are
messages this server will send to any address typed into a public form — a
reflected-mail surface, bounded by the endpoint's 10/min throttle. Fixed
content is a nuisance to abuse; content the sender supplies is a relay.

**If the scheduler stops, mail stops silently** — nothing throws, nothing is
logged, no `mail_error` is written. `GET /admin/settings/mail` therefore reports
`queue.pending`, `queue.failed` and `queue.oldest_seconds`, and the settings
screen warns when the oldest waiting job is over five minutes old. The **age**
is the figure that matters, not the count: a hundred jobs queued in the last ten
seconds is a busy minute, one job sitting for an hour is a broken deployment.

**Outgoing mail is chosen in Settings, and `MailTransport` is the only list.**
Seven transports — SMTP, Gmail via OAuth, Brevo, Mailgun, SES, SendPulse and
log — with the enum owning each one's label, its fields, its composer package and whether that
package is installed. The settings screen builds its form from
`transports[].fields` and `MailSettingsProvider` configures Laravel from the
same enum, so adding one is a case rather than a change in four files that then
have to agree. **Every one of them also speaks plain SMTP**, so the `smtp`
transport reaches Brevo, Mailgun or SES with no bridge at all.

**SendPulse is a preset SMTP, not a bridge.** Asked for on 2026-09-15.
`smtp-pulse.com:465` over SSL is what SendPulse documents, so the case fixes
the host, the port and the encryption and asks only for the login and the
*SMTP* password — a separate credential from the SendPulse sign-in, which is
the one people paste by mistake and which fails as an authentication error.
`applySendPulse()` writes the `smtp` mailer exactly as `applySmtp()` does,
so the test button, `mail_error` and the queue are the same path; nothing is
applied until both credentials are set. `OutgoingMailTest` pins the fields,
the host and the half-filled case.

**Two of the three API bridges ship; SES does not.** `symfony/brevo-mailer` and
`symfony/mailgun-mailer` are required, along with `symfony/http-client`, which
both call at runtime while declaring it dev-only — install either bridge without
it and the first send fails. `aws/aws-sdk-php` is **deliberately absent**: it is
~50MB of vendor on every deploy for a transport nobody has chosen yet, and
`composer require aws/aws-sdk-php` is the whole of turning SES on.

That makes `isAvailable()` a live path rather than a defensive one. It is a
`class_exists`, so it describes *this server* rather than composer.json: SES is
offered, disabled, and labelled with the command that installs it — the same
rule the media library follows when it refuses to resize an SVG. Better than a
class-not-found the next time a ticket tries to send a receipt.

**A transport can be stored that this server cannot build.** Choosing SES in
the dropdown is impossible — the option is disabled — but a stored value
survives a vendor directory changing under it, which is exactly the case
`MailSettingsProvider` guards: it logs and leaves `.env` in charge rather than
half-applying a transport that would throw on the next send, and the test button
answers 422 with the install command. The "not installed" alert is therefore
reachable **only from stored state**, so no audited route renders it — it was
measured by hand at 5.36:1 light and 7.57:1 dark. That is the same gap that let
`Alert` ship 1.53:1 in dark for months.

**Laravel's Mailgun factory reads `secret`; Brevo's transport reads `key`.**
Both are "the API key" and both are a string in a config array, so nothing —
not the type checker, not a code review — distinguishes them. The wrong one
produces `Undefined array key "secret"` at *send* time, from a screen that had
just reported the settings saved. `MailSettingsProvider::applyMailgun()` is the
only place that spelling is decided, and
`tests/Feature/OutgoingMailTest.php` builds each API transport for real to pin
it: reverting the one word fails exactly two of the nineteen.

**A field two transports share must be rendered once, not once per panel.**
`mail_api_key` belongs to Brevo *and* Mailgun, and the mail panel keeps every
transport's fields mounted — so a panel-per-transport layout put two inputs
with the same `id` and `name` in one form. The label then focuses the hidden
twin, and the browser submits both values for one key. It appeared to work only
because a blank secret means "unchanged" and the empty one was discarded; that
is a rule from the settings API holding the form together by accident.
`mail-panel.tsx` renders the deduplicated union and hides what the chosen
transport does not read.

**The mail test takes an optional recipient, and the body is what keeps it
safe.** It defaults to the signed-in administrator; an address may be given
because the question it usually answers is whether mail reaches *outside*, and
a Gmail inbox proves SPF, DKIM and reputation in a way the same domain cannot.
What stops that being an open relay is that **the caller cannot influence a
byte of what is sent** — one fixed sentence, an authenticated administrator,
six a minute, and the recipient written to the activity log. The input carries
no `name`: it sits inside the settings form, and a named field would either be
saved as a setting or silently dropped depending on its prefix. Enter is
intercepted for the same reason — the default action there is "save every
setting on the screen".

**`mail_error` exists because `Notifier` swallows.** A committed ticket must
still answer 201 when mail is down, which is right for SMTP where failure means
an outage — and not enough for OAuth, where a refresh token expiring is a
certainty. Without it the console looks healthy while every receipt stops
arriving. A failed refresh or send writes it, Settings shows a banner, a
successful test clears it. **Do not "fix" this by making Notifier throw.**

**The OAuth redirect is compared to this site's callback path exactly.** It is
echoed to Google and reused at exchange, so an unchecked value is an open
redirect ending with somebody else holding a code for this mailbox.
`str_contains` would accept `technoware.in.attacker.test` — the same reasoning
`App\Support\YouTube` already follows. The `state` is server-side and
single-use for the matching reason.

**Google's SMTP scope is full mailbox access and there is no narrower one.**
`https://mail.google.com/` is what SMTP AUTH accepts; `gmail.send` is send-only
and works only against the Gmail HTTP API, which is a different transport.
`access_type=offline` *and* `prompt=consent` are both required or no refresh
token comes back at all — and the connection then dies in an hour, looking like
a bug in the exchange.

**A mail settings change takes effect on the next request**, because
`MailSettingsProvider` applies it at boot. Save, then test. In a test, re-boot
the provider and `Mail::purge()` — the manager caches a built mailer per name,
so new configuration reaches nothing until the old instance is dropped.

**The `log` transport gets its own channel at `debug`.** Laravel's log mailer
calls `$logger->debug(...)`, and both `.env` files ship `LOG_LEVEL=warning` — so
choosing "write to the log" produced a cheerful "sent" and nothing on disk
anywhere. It now writes to `storage/logs/mail.log` on a channel pinned to
`debug`. Exactly the trap the password-reset audit line was already caught by.
