# Security review — 2026-09-20

A focused review of what the branch added since the last one
(`docs/deep-code-audit-2026-09-03.md`): the uncommitted tree of 0.70.0 (A/B
subject testing, recorded refunds, the `catalogue` menu item, the lead
word list and re-score, the console role guard and its `x-pathname` header,
the media Dialog and folder-delete confirm) and commit `b6eea57` (0.62–0.69:
email-to-ticket over IMAP/XOAUTH2, the mailbox subscriber scan, IndexNow,
Search Console, the SEO AI extensions, `llms.txt`, theme options, the
animation pass). Method: one researcher over the diff with the codebase's
own security patterns as the comparison, then one independent verifier per
candidate with a false-positive rubric; only a finding both rate at 8/10 or
above is reported as a vulnerability. Read-only; nothing was reproduced
against a live system.

## Result

**No finding reached the reporting bar.** Three candidates were raised;
one is real and was acted on below the bar, two are false positives.

| # | Candidate | Researcher | Verifier | Verdict |
|---|---|---|---|---|
| 1 | Email-to-ticket trusts the `From` header: a forged sender can append a message to another customer's ticket | 7 | 6, MEDIUM | Real, documented v1 trade-off (`docs/tickets.md`), off by default. **Mitigated** — see below |
| 2 | Unknown email sender becomes an active portal account; the acknowledgement echoes the subject to the `From` address | 6 | 3, LOW | The account is the sender's own and grants nothing another route does not (`customer_approval_required` is off by default; a spoofed address's account cannot be signed into); the echoed subject is standard autoresponder backscatter inside fixed wording |
| 3 | A `campaign_manager` can name any IMAP host and port for a one-off scan | 6 | 2, LOW | The library reads the greeting before sending a byte and refuses anything that is not `* OK`; the stored error is the library's fixed string, never the banner. A staff-only "is there an IMAP server there" oracle, which is the feature |

### What was done about #1

`MailFilter` now reads the mailbox provider's own verdict. Gmail and
Microsoft 365 both stamp `Authentication-Results` on every delivered
message; a `dmarc=fail`, Microsoft's `compauth=fail`, or an `spf=fail` with
no `dkim=pass` to redeem it is skipped as `spoofed` — one more row in the
"what never becomes a ticket" list, recorded in the ledger like the others,
and one more data-provider row per case in `InboundMailTest`, plus a test
that a forwarded message DKIM still vouches for, and a message with no
verdict at all, are still people. A bare IMAP server that stamps nothing is
unchanged, and `docs/tickets.md` goes on saying so. The full fix the
verifier named — threading only on an `In-Reply-To` that names a
Message-ID this system sent, or a per-ticket token in the Reply-To — is
recorded there as the next step if the gap is ever hit in practice.

One adjacent point the verifier of #2 raised, worth knowing: a customer
created from an inbound message is synced into the "Existing customers"
newsletter group by `Customer::booted`, suppression-checked but not
consent-checked. With `spoofed` mail now dropped, a forged `From` no longer
reaches that path on a provider that stamps verdicts.

## Cleared

Each of these was read to its sink and found to follow the codebase's
established rule:

- **`x-pathname`** — set by `proxy.ts` on every `/admin` request it sees; a
  client-supplied value on a prefetch changes only the requester's own
  render, and every data fetch still goes to the API under `role:`. The
  guard is the page agreeing with the API, not a boundary.
- **OAuth, both new slots** — 24-byte `state`, single-use through
  `Cache::pull`, namespaced per slot; `redirect_uri` compared to an exact
  host and path; every token and secret `is_secret`; the `tickets` and
  `newsletter` groups absent from the public settings whitelist.
- **Scan credentials** — `Crypt`-sealed in the cache under a random key
  only the job chain carries, never in a job payload or a setting,
  forgotten in `finally`.
- **Manual refund** — `role:store_manager`, bound by order number, integer
  paise, ceiling enforced under `lockForUpdate`. (Business note: the
  ceiling is `max(paid, total)`, so an order whose payment was recorded
  short can be refunded up to its total.)
- **A/B decide** — `role:campaign_manager`, `winner` allow-listed,
  idempotent conditional update; `subject_b` validated like `subject`.
- **`catalogue` item** — key allow-listed twice, children refused,
  expansion a fixed published + `show_in_menu` query.
- **IndexNow** — the key file answers only for the stored key; off by
  default; pings only from model hooks.
- **Search Console** — RS256 over the stored PEM, read-only scope, the
  credential never returned.
- **AI alt text** — reads only the media row's own disk and path, raster
  allow-list, 4MB cap; **article brief** — model output read by key, HTML
  built from escaped text then `HtmlSanitiser::clean`, links by index into
  real pages, born `draft`, `role:admin`; **bulk runs** — types and ids
  allow-listed, cap enforced before queueing.
- **Email attachments and bodies** — extension allow-list plus sniffed MIME,
  random path on the private disk, names stripped of separators; bodies
  are plain text rendered as text nodes.
- **Ledger dedupe** — a Message-ID a sender chooses cannot pre-empt one a
  victim will send.
- **`llms.txt`, robots, theme options, the animation classes, the Dialog
  and folder confirm** — published content or client UX only.

## What this review is not

A static read of one branch's changes by a model, against a rubric that
deliberately excludes denial of service, rate limiting, hardening and
dependency age. It is not a penetration test, it did not exercise the
payment gateways or the OAuth consents against real accounts, and the
two earlier audits (`deep-code-audit-2026-08-27.md`, `-09-03.md`) cover
what was built before this branch.
