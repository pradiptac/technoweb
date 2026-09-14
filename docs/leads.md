# Leads

Every contact form lands in one pipeline; the scoring rubric; the status machine.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**Every contact form in the product lands in one pipeline, and `leads` is
its own table rather than columns on `enquiries`.** Two intakes already existed
with incompatible shapes: `enquiries` has fixed columns, `form_submissions` is
whatever an editor built — a bag of JSON keyed by names they chose, on a form
that need not collect an email address at all, while `enquiries.email` is
`NOT NULL`. Neither can absorb the other. So a lead **snapshots** the contact
and points back at whichever row it came from, the same split an order item
makes against a product: the submission is the immutable record of what somebody
sent, the lead is the workable one that gains a status, an owner and a follow-up
date. Neither is a cache of the other, and the snapshot cannot drift because
nothing in the product ever edits a submission.

**The source page cannot be read from the request, and a column filled from
`Referer` would measure nothing while looking perfectly plausible.** Every form
here submits through a Server Action — browser, Next server, Laravel — so by the
time the API sees it, `Referer` is the Next server. The page has to say where it
is, in the browser, and post it: `PageContextFields` renders the hidden inputs
and fills them in an effect through refs (state would be a hydration mismatch,
and seeding state from an effect is what `react-hooks/set-state-in-effect`
refuses). `App\Support\Crm\PageContext` reads them back and **derives**
`source_path` from the URL rather than accepting it separately, so a lead cannot
claim a page its own URL contradicts.

**Every envelope key begins with an underscore, and that is load-bearing.**
They travel in the same body as an editor-built form's own answers. A form field
key is validated against `^[a-z][a-z0-9_]*$`, so a field named `_source_url`
**cannot be created** — the collision is impossible by construction rather than
forbidden by a rule somebody has to remember, which is a stronger guarantee than
the `not_in:website` the honeypot relies on. They are read off the request, never
out of the validated data: `FormValidator` drops every key the form does not
declare, so anything treated as an answer would be discarded before it reached
the lead.

**`LeadScore` is a rubric, not a model, and it is scored out of what applies.**
Each check declares whether it *applies* before whether it *passed*, and the
total divides by the applicable weight — the shape `SeoScore` uses, and for the
same reason: a form that never asked for a message cannot earn the two message
checks, and marking it down for them parks every submission from that form in the
forties with nothing anybody could do. The reasons are stored on the row beside
the number, so a figure never appears without its working, and the number stays
explainable after the rubric moves. **Nothing files anything as spam
automatically** — junk scores low and stays in the queue, because auto-filing
eventually hides a real customer whose message was three words and nobody ever
finds out. **Nothing makes a network call**: no verification, no enrichment, for
the reason `email:dns` is banned on these forms.

**Intent matching needs inflections, and `\bwords?\b` is not enough.** "PO"
inside "port" is a false positive on the most common noun in this catalogue and
"buy" inside "buying" is a false negative on the most obvious signal there is; a
trailing `s?` fixes the plural and leaves "-ing", which is what shipped until the
boundary test caught it. The suffix set is explicit and applies only from three
characters, because appending one to a two-letter stem does not produce a form of
the same word — it is how "po" would start matching "pod".

**A lead's status dropdown offers only the moves the API will accept.**
`LeadStatus::allowedNext()` puts the current status first and lists what it can
transition to; the console builds the select from that. A dropdown is a promise —
the argument `schema_type` settled — and offering six statuses then refusing four
with a 422 is a form arguing with whoever filled it in, after they have typed a
note to go with it. **`Spam` is reversible and so is `Won`**: a misfiled real
enquiry is a customer nobody ever answers, and a mis-click on a terminal state
with no way back is a figure somebody has to correct in the database.

**`contacted_at` is stamped by reaching a state that means somebody replied**,
not by any move at all — `New → Lost` is a lead written off unanswered, and
recording that as a contact would flatter the one figure the column exists to
produce. It is never cleared, the rule `resolved_at` had to be taught on tickets.
`closed_at` is the deliberate exception and *is* cleared by a move back into the
pipeline, or a revived lead sits in a report of deals settled in a month it is
still being worked in.

**Nothing merges two enquiries from one address, and that is deliberate.** The
obvious feature loses the second message, which is routinely the one that says
what they actually want. Each submission is its own lead; the relationship is
*shown* — the detail screen lists everything else that address has sent, and
having been in touch before is a scoring signal. The useful half of deduplication
without the destructive half.

**`LeadIntake` runs before the notification and can never fail the submission.**
The email is the announcement and the lead is the record, so a dead mail server
must not be able to lose an enquiry from the desk that works them. It catches its
own failures and logs at `warning` — both `.env` files ship `LOG_LEVEL=warning` —
leaving the submission row on disk to rebuild from.

**A lead is `role:sales_manager`.** Blast radius rather than skill, the argument
`campaign_manager` and `store_manager` are made with: this holds every enquirer's
name, telephone number and what they are planning to spend, which is worth more
to a competitor than anything else in the console. Deliberately not
`support_engineer` — support answers people who have already bought.

**`enquiries.source` is a *kind* of page and often carries a slug.**
`EnquiryForm` is rendered with `source={`product:${slug}`}`, so the column holds
`product:cisco-cbs350-24t-4g`. Matching the whole string labelled every product
enquiry on the site "Enquiry form", and it survived because the contact page
passes a bare `contact` — the one call site that got tested was the one case that
worked. Split on `:` and read the kind. It is not a page and never touches
`source_path`.
