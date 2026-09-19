# Email to ticket

The support mailbox read into the ticket system: IMAP, Gmail and Microsoft 365
over OAuth, the loop rules, the ledger, and what a reply does.

Written 2026-09-19 with the feature. Each note is a rule and the reasoning
behind it; the one-line form of every rule is in `CLAUDE.md` under "Modules".
Add a new note here **and** its one-line rule there.

**It is off by default and, off, reads nothing.** `inbound_mail_enabled` is
`0` from the seeder; `technoware:pipe-inbound-mail` returns before touching
the network; the acknowledgement keeps its "use the portal" line; no
notification changes its headers except the `Auto-Submitted` ones, which
cost nothing and are right regardless. "Don't break the existing system" is
a structural property — every new behaviour is behind
`InboundMail::enabled()`, which is the switch *and* enough configuration to
attempt a connection. With the switch on and nothing filled in, the mailbox
reads as off rather than failing every minute and writing the same error
every minute.

**Three ways in, all ending in IMAP.** `App\Enums\InboundMailProvider` is
the list: a host and a password (`imap`), or a consent for Google or
Microsoft whose access token is the IMAP password (XOAUTH2 — the only way
either will let a program read a mailbox now). The settings panel builds its
form from `fields()`, the connection from `imapHost()`, so adding a provider
is a case rather than a change in four files. Gmail is `imap.gmail.com:993`,
Microsoft `outlook.office365.com:993`.

**`webklex/php-imap`, and `ext-zip` because it says so.** Pure PHP — this
server has no `ext-imap` — with XOAUTH2 built in and a MIME parser. It
declares `ext-zip`, which this machine lacked; the extension is bundled with
PHP on Windows and Plesk and was switched on in `php.ini`. The alternative,
`composer require --ignore-platform-req=ext-zip`, was refused: Composer 2
writes `vendor/composer/platform_check.php`, which checks required
extensions at autoload, so a deploy without ext-zip would fatal the whole
API at boot rather than the one feature. The newsletter's "`.xlsx` without
ext-zip" rule still holds — that reader uses nothing from it. The status
endpoint reports `php.zip` (and the library's other four extensions) from
`extension_loaded()`, and the panel says so the moment a provider is chosen:
a warning naming the missing extension, or the reminder to tick the same box
for the PHP the site is deployed under — before a password is saved, not at
the first connection.

**The outgoing and the inbound mailbox share nothing, by construction.**
`App\Support\OAuth\OAuthConnection` is `MailOAuth` generalised: the same
single-use state, the same locked refresh, the same `*_error` write on a
refusal, keyed by a *slot*. The outgoing slot is `oauth_*` / `mail_error` /
cache `mail-oauth-*`; the inbound is `inbound_oauth_*` /
`inbound_mail_error` / `inbound-oauth-*`. A state minted for one slot cannot
be spent by the other because the cache key carries the slot's name —
`InboundMailSettingsTest` posts an inbound state at the mail callback and
proves the refusal. `MailOAuth` kept its public static API verbatim so
`MailController`, `MailSettingsProvider` and `OutgoingMailTest` did not
change; that suite was the regression gate for the refactor.

**The inbound consent asks for `openid email`; the outgoing one never did.**
XOAUTH2 over IMAP authenticates as an *address*, and the administrator may
not have typed one anywhere — the id_token is the only place it can come
from with certainty. Google's scope is the same full-mailbox
`https://mail.google.com/` (there is no read-only IMAP scope, as there is no
send-only SMTP one); Microsoft's is
`IMAP.AccessAsUser.All offline_access openid email`, and `offline_access` is
what makes a refresh token come back at all. Microsoft has no refresh-token
revocation endpoint, so disconnecting from it forgets locally and says so.

**Two callback paths, one check.** `CallbackPath::assert()` is
`MailController::safeRedirect()`'s body with the path as an argument: exact
host (`FRONTEND_URL`'s, or localhost), exact path. Outgoing mail accepts
`/admin/settings/mail/callback` and nothing else; the ticket mailbox accepts
`/admin/settings/tickets/callback` and nothing else — the *mail* path is
refused there, tested, because a consent started from the Ticketing panel
must not be spendable as the sending mailbox.

**The ledger's unique index is the idempotency.** Every message is written
to `inbound_emails` under its Message-ID (angle brackets off, case folded)
*before* anything else happens. IMAP delivers the same message again after
a crash mid-run, after a flag that did not stick, after somebody drags it
back into the inbox — and a read-then-write "have we seen this" check
passes every test on one thread and mints two tickets the day two runs
overlap. The insert cannot happen twice, so a redelivered message opens one
ticket and sends one acknowledgement whatever the mailbox does. A message
with no Message-ID gets a deterministic one from what it does carry, marked
`@synthetic.technoware`, so its redelivery collapses too.

**A `processing` row nobody has touched for ten minutes is taken over.** The
one gap in "ledger first" is a run dying between the row and the ticket:
the row then blocks the message for ever. `TicketPiper` reuses such a row
rather than treating it as seen — a ticket opened twice is worse than a
complaint opened never only in the other direction.

**The mailbox flag is the convenience; the index is the guarantee.** After
a message is handled it is moved to `inbound_mail_processed_folder`
(default, and what the client chose because staff read the same inbox by
hand) or marked `\Seen`. In `move` mode the piper reads *everything* in the
folder and lets the ledger say what is new, so a message a person opened
first is still a complaint. In `seen` mode it reads unread mail only, and a
person marking mail read before the minute ticks stops it being piped —
the panel's option text says so. A flag that fails to stick is a logged
warning, not an error: the next run re-reads the message and the ledger
catches it.

**What must never become a ticket, in the order it is checked.** `MailFilter`
is one data-provider test per rule. Our own mail landing in the box —
`own_address`, from every address this installation sends *as*
(`mail_from_address`, `support_email`, the connected accounts, the IMAP
login, …), derived from the settings so a changed sender is covered the
moment it is saved; this is what stops the desk's "New ticket" notification
opening a ticket about a ticket once a minute when `support_email` is the
piped address. A staff member forwarding a complaint (`staff_sender`, from
`users.email`), who must not become a portal customer for it. Then the
machine mail a machine must not answer: `Auto-Submitted` other than `no`,
`X-Auto-Response-Suppress`, `Precedence` bulk/junk/list/auto_reply,
`List-Id`/`List-Unsubscribe`, the `X-Autoreply` family, and bounces — an
empty Return-Path, a `mailer-daemon`/`postmaster`/`noreply` local part, or
`multipart/report`.

**Every ticket notification is machine mail, whether or not piping is on.**
`MailHeaders::machine()` puts `Auto-Submitted` (RFC 3834) and
`X-Auto-Response-Suppress: All` on the acknowledgement, both reply
notifications and the desk's "New ticket": it costs nothing, it is what a
well-behaved auto-responder — an out-of-office, another ticketing system,
our own piper — reads before deciding to answer, and the alternative is two
auto-responders writing to each other all weekend. The customer-facing ones
are `auto-replied` (an answer to something a person did), the desk's
`auto-generated`.

**The Reply-To points at the mailbox only while it is being read.**
`InboundMail::replyTo()` is the typed address, else the connected account,
else the IMAP login — and null with piping off, because pointing a
customer's reply at an address nothing reads is worse than leaving the
sender's on it. The acknowledgement's closing line follows the same switch:
"Reply to this email, or use the portal" against "Replying to this email
will not reach us". The catalogue's built-in wording, which cannot branch,
now says to quote the reference in any reply — true in both modes. Only the
*customer's* copy of a reply notification gets the Reply-To: a staff reply
belongs in the console, and the piper would skip it as `staff_sender`
anyway. `TicketMailHeadersTest` runs the Symfony callbacks against a real
`Email` rather than reading a property.

**A reply threads onto the ticket only when it is the sender's own open
ticket.** The reference is the `TW-YYYY-NNNNN` every notification puts in
its subject, so a reply to any of them carries it back. Same customer
(case-insensitive) and not Closed → a `TicketMessage` with
`author()->associate($customer)` (the morph map; never a literal
`author_type`), `channel = 'email'`, quoted history cut off, and the same
PendingCustomer → InProgress move the portal makes, with the desk told and
no second acknowledgement. Closed and the same customer → a *new* ticket
prefixed "Follow-up to {ref}, which is closed." Somebody else's reference →
a new ticket for the sender, and nothing about the referenced ticket is
disclosed. In both new-ticket cases the old reference is stripped from the
subject, or the new ticket's notifications would carry two references and
the next reply would match the wrong one.

**The reply parser is a heuristic and says so.** `ReplyParser::stripQuoted`
cuts at the markers the common clients write — Gmail's "On … wrote:"
(wrapped across two lines as Gmail does), Outlook's "-----Original
Message-----" and its underscored separator, the French, German and
Spanish equivalents — then drops trailing `>` lines. When that would leave
nothing, the whole text is kept: a reply that is only quoted text is still
a reply. The test cases are written the way each client actually formats a
reply, for the reason the sanitiser's positive tests assert against what a
browser emits.

**An unknown sender gets a portal account, in the shape
`technoware:customer` makes one.** Active, verified, approved, with a
password nobody knows and a name from the display name or the local part.
The address proved itself by sending — the same proof a sign-in code asks
for — and the approval queue exists for strangers filling in a form, not
for customers who have just written to the desk. They can sign in with a
code to the address they used. `inbound_mail_unknown_sender = ignore` turns
this off: such mail is `skipped:unknown_sender`, listed on the panel, and
nothing is sent. The spam exposure of `create` is bounded by the junk
filter, the 25-per-run cap and that switch.

**Attachments follow the portal's rule, and the rule lives in one place.**
`App\Support\Tickets\AttachmentStore` holds the extension list
(png, jpg, jpeg, gif, webp, pdf, txt, log, csv), the five-file cap, the size
from `config('support.attachment_max_kb')` and the private disk; the two
request classes build their `mimes:`/`max:` rules from it and the
`StoresTicketAttachments` trait delegates to it, so the two doors cannot
drift. An email's file is gated on its metadata *before* its bytes are read
— `IncomingAttachment::contents` is a closure, and the test asserts an
oversize one is never called — then sniffed with `finfo`, because nothing
upstream checked that a `.pdf` is a PDF. Inline parts with a Content-ID
(signature logos) are skipped. Whatever is dropped is named in the ticket's
text and the ledger's `reason`, so the desk knows a file was sent and not
kept.

**Body and subject are held to the portal's own limits.** Text part first,
else the HTML part through `HtmlSanitiser::toText()` (plain text — the
console renders it escaped), 20 000 characters with a truncation note, a
blank body stored as "(No text — see the attachments.)" and a blank subject
as "(No subject)". A message that fails past the filter — a write refused,
a customer that cannot be created — is `failed` in the ledger with the
exception's words, written to `inbound_mail_error`, and still marked
processed: a poison message retried every minute is a mailbox that never
gets past it.

**A mailbox that refuses us is a banner, not a failed scheduler event.** The
command always exits 0. Connect and auth failures go to `inbound_mail_error`
in the server's own words — measured against imap.gmail.com with a wrong
password: `NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)` — and
a clean run clears it. Nothing is lost by a refusal: the mail stays where it
is and is picked up when the credentials are fixed. "Check the connection"
on the panel is the same probe, reads only, and never pipes anything.

**Piping inherits the scheduler's silence.** It runs every minute under
`withoutOverlapping(10)` — one run at a time, the lock expiring after ten
minutes so a hung socket cannot stop piping until somebody clears the cache;
the client's own timeout is thirty seconds and a run takes at most
twenty-five messages. When the scheduler stops, the mailbox is simply not
read, so the panel shows the last-run time and the same heartbeat warning
the mail screen shows, with the crontab line.

**`ImapMailbox` is the one part not unit-tested, and the piper is tested
without it.** An IMAP session cannot be faked usefully — the standing the
Google consent handshake has — so `Mailbox` is an interface, `FakeMailbox`
implements it from arrays, and `InboundMailTest` drives every decision from
"a message arrived" to "a ticket exists and somebody was told" against the
real database through the real command. The adapter's job is only to turn
a webklex `Message` into an `IncomingMessage` and to flag or move it.

**What v1 does not do, written down.** No SPF/DKIM verdict is read — IMAP
gives none unless the provider adds `Authentication-Results` — so a spoofed
From yields a message on that customer's ticket and an acknowledgement to
the real address, which does not echo the body; skipping on
`dkim=fail`/`spf=fail` is the obvious follow-up. Microsoft shared mailboxes
(the `user\shared` login form) are out of scope; a licensed mailbox is what
the consent connects. A Google consent screen still in "Testing" expires its
refresh token after seven days, the same fact the outgoing connector lives
with; publish it or use an internal Workspace app. Microsoft 365 needs IMAP
enabled on the mailbox and can be blocked by Security Defaults or
Conditional Access. The ledger is pruned after 180 days
(`technoware:prune-inbound-emails`), well past any plausible redelivery.
