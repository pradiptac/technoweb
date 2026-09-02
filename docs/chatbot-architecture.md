# The website assistant — architecture

Rule 10 of the roadmap asks for a concise technical record. This is it.

Phases 1–8 are built: the foundation, the AI provider, website knowledge
retrieval, products and the store, brands and content, support navigation, and
lead capture on detected buying intent. Phases 9–19 are not.

---

## Where the specification and this codebase disagreed

The specification was written without sight of the code. Four places where it
was followed in spirit rather than to the letter, each because the codebase
already answers the question:

| Specification | What was built | Why |
|---|---|---|
| `chat_leads` table + an admin Leads screen | Neither | `leads`, `LeadIntake`, `LeadScore` and `/admin/leads` already exist. *Every contact form in the product lands in one pipeline* — a second table and screen would be two answers to "who asked us to call them", one click apart. **Built:** a chatbot lead is a lead with `channel = 'chatbot'`, scored on the same rubric, with the conversation as its source. |
| `chat_settings` table | A `chatbot` settings group | There is a `settings` table with groups, an admin screen that builds its own form from it, and encryption for secret rows. A second settings mechanism for one module is a second place to look. |
| `AI_API_KEY` in `.env` | Settings first, `.env` second | Provider credentials here live encrypted in the settings table so a client can rotate a key without a deploy — the arrangement the six outgoing-mail transports use. `config/services.php` remains the fallback so a fresh install works before anybody opens the console. |
| shadcn/ui | This project's own primitives | There is no shadcn or Radix here. `CLAUDE.md` requires reusing `Button`, `Card`, `Field` and the rest. The instruction behind the letter — *look like part of the website* — is better served by the components the website is made of. |

---

## The shape

```
Visitor ── Next.js (Server Action) ── Laravel ── OpenAI
                                          │
                                          └── Retriever ── published content only
```

The browser never talks to OpenAI and never sees the key. It does not see the
conversation token either: that lives in an httpOnly cookie the Next server
sets and forwards, the arrangement the basket already uses.

### Files

| | |
|---|---|
| `app/Support/Chat/Retriever.php` | What the assistant is allowed to know |
| `app/Support/Chat/Assistant.php` | The system prompt, the context window, the grounding decision |
| `app/Support/Chat/AiProvider.php` | The interface — messages in, text out |
| `app/Support/Chat/Providers/OpenAiProvider.php` | The only implementation |
| `app/Support/Chat/ChatSettings.php` | Every number, read once |
| `app/Http/Controllers/Api/V1/ChatController.php` | Three public routes |
| `web/src/components/chat/chat-widget.tsx` | The launcher and the panel |
| `web/src/components/chat/chat-actions.ts` | The Server Actions and the cookie |

---

## How invention is prevented

Not by asking the model nicely. Four mechanisms, in order of how much work
they do:

**Nothing retrieved means the model is never called.** Asked a question with no
context attached, a helpful assistant helpfully invents — so the call is not
made, the configured fallback is returned, and the question is written to
`chat_events` as `unanswered` for somebody to turn into a page. This is the
single most important behaviour in the module and it has its own test.

**Retrieval cannot reach anything private.** There is no branch in `Retriever`
that touches a customer, an order, a ticket or an activation code. §15 and §34
are enforced by absence, which is the only enforcement a prompt cannot be
talked out of. A test asserts every type it can return is on a public list.

**Figures travel labelled.** A price reaches the model as
`price_inr: 11800.00` and availability as `in_stock: yes`, both from the
database. A labelled figure is repeated; an unlabelled one is reasoned about.

**The system prompt is written as prohibitions**, not as a personality, and
`temperature` is 0.2. Style instructions are last because they matter least.

---

## Retrieval, and the bug that shaped it

`LIKE` across titles and summaries. No vector database — Rule 6, and right for
a corpus of a few hundred records whose questions are overwhelmingly "do you
sell X" and "do you do Y".

Two things were wrong in the first cut, and only running it found them:

**A question is not a search term.** The whole sentence was used as one `LIKE`,
so "Do you have a 24-port managed switch?" looked for that exact string and
found nothing. Every real question fell through to the fallback.

**Then it found everything.** With the sentence tokenised but two-letter words
kept and bodies searched, a six-question probe returned *the same eight
records* for every question, including one about software this company has
never heard of — `LIKE '%do%'` matches London, window and adopt, and a body is
long enough to contain almost any word.

So: three letters minimum (two for numbers, because "24" and "48" are most of
what this catalogue is asked), a stop list, and **titles and summaries, never
bodies**. FAQs and the knowledge base are the deliberate exceptions — their
body *is* the answer, and the knowledge base's own `search()` scope already
matches tags and a punctuation-stripped title, so "wifi" finds "Wi-Fi".

Measured after, against the real site:

```
Do you have a 24-port managed switch?  -> the switch, Enterprise networking, Enterprise Wi-Fi
What networking solutions do you provide? -> Enterprise networking (only)
Do you provide AMC?                    -> IT infrastructure AMC
How do I configure my email?           -> Business email + the mobile setup guide
Do you support XYZ123 software?        -> two loose matches, and the model declines
```

**Two more, found the same way — by running it, months later.** Both are about
`grounded` rather than about the wording of an answer, which is what makes them
worth more than they look: `grounded` is what decides whether a question reaches
`/admin/chat/unanswered`.

*A plural question missed a singular title.* `LIKE '%firewalls%'` does not match
"Firewall & UTM", so "what do you do about firewalls?" retrieved **nothing**
while "…about firewall?" retrieved three. Each plural-looking term now
contributes its stem as well, never instead — the change can only widen, and a
stem that is not a word matches nothing rather than something wrong. The other
direction needed no help: `%switch%` already finds "switches", because `LIKE`
is a substring test.

*A three-letter term matched a fragment.* `%eye%` matches "sur**veye**d", so
"do you do laser eye surgery?" came back holding the Enterprise Wi-Fi page —
and came back grounded, which is the damaging half. An honest "we do not cover
that" is the right answer either way; a grounded flag on it keeps a real gap
off the list that exists to collect gaps. Terms of three characters go through
`REGEXP '\b…\b'` instead.

**The floor stays at three characters.** Raising it to four would have fixed
the second bug and broken the catalogue: AMC, NAS, PoE, SSD and VPN are most of
what this site is asked about. Length was never the problem — substring
matching a short word was.

Measured after both:

```
What do you do about firewalls?  -> Firewall & UTM + two FAQs   (was 0)
Do you sell switches?            -> the switch, Enterprise networking
Do you offer AMC?                -> IT infrastructure AMC        (unchanged)
What is a NAS?                   -> Storage & NAS                (unchanged)
Do you do laser eye surgery?     -> nothing                      (was Enterprise Wi-Fi)
```

Both are control-run in `ChatTest`: disabling the stemming fails exactly the
plural test, disabling the boundary fails exactly the short-term one, and
neither touches anything else.

---

## Cost, and what bounds it

Four ceilings, because each bounds something different:

| | |
|---|---|
| `throttle:12,1` on send | One visitor, per minute |
| `chatbot_max_message_chars` | One message |
| `chatbot_max_messages` | One conversation |
| `chatbot_daily_reply_cap` | **The bill.** A rate limit bounds one person; only a total bounds a bad afternoon |

`chatbot_context_messages` trims what travels with each request — §36's "do not
send the entire conversation history indefinitely".

---

## Privacy

A transcript holds whatever a visitor typed, given by somebody with no account
to come back and delete it. `technoware:prune-chats` runs nightly beside the
activity and CV prunes, with a seven-day floor so a typo cannot destroy
yesterday. `chat_retention_days` defaults to 90.

`session_token` and `ip` are hidden on the model and absent from every
resource. System messages never reach a browser — `visibleMessages` is the
boundary, structural rather than a filter somebody has to remember.

---

## Settings

Four are published to the site because the widget is drawn before anybody
speaks: `chatbot_enabled`, `chatbot_welcome`, `chatbot_quick_actions`,
`chatbot_fallback`. They are named in `ChatSettings::PUBLIC_KEYS` and
whitelisted explicitly, exactly as `newsletter_signup_enabled` is — the group
also holds the model and the spend caps, and "everything except what I
remembered to hide" is the wrong default on an unauthenticated endpoint.

**Off by default.** Switched on it spends money on every message, and a module
that starts billing the moment a migration runs is one nobody agreed to.

There is no admin screen yet — that is Phase 13. Until then it is switched on
by a settings row.

---

## Intent, and what it changes

`App\Support\Chat\Intent` — rule-based, no model call, run before retrieval.
§9 lists ten intents; three are detected here, because **an intent is only
worth detecting if something changes because of it**. Support puts the portal
in front of somebody, sales puts the contact form there, everything else gets
the answer and its links. Ten labels acted on by three would be seven labels of
decoration.

Two word-list bugs, both found by running it:

**The bare word "support" is not a support request.** "What brands do you
support?" and "do you support VLAN tagging?" are a catalogue question and a
specification question, and both were being routed to the help desk. It now
only counts inside a phrase — "need support", "contact support", "support
desk".

**"Download" is not "down".** An unbounded substring match sent every
firmware-download question to the support desk. Both lists are matched on word
boundaries.

Support wins a tie with sales: "my firewall is broken, how much is a new one"
is both, and somebody whose kit has stopped working wants the desk first.

The actions are **stored on the message**, not derived when the transcript is
read, because what to offer depends on whether the visitor was signed in and
that changes. A transcript should show the buttons that were actually there.

## Brands

The one question in the module answered by asking *about* the records rather
than matching against them: after the stop list, "what brands do you support?"
leaves only "brands", and no brand is called that. A question mentioning brands
in general returns one record listing them; a question naming a brand returns
that brand.

The link is `/products?brand=…` and never `/brands/…` — a brand landing page is
programmatic and exists only if somebody published it, so pointing at one is a
404 in the middle of an answer. A brand with nothing in the site catalogue
behind it is not offered at all, the rule `/brands` already follows.

## Feedback, and the console

**Thumbs on a grounded answer only.** Asking whether "we cannot confirm that
from the website" was helpful is asking somebody to rate an apology, and the
answer says nothing about the assistant — it says the site does not cover the
question, which the unanswered list already records. A rating is scoped to the
conversation holding the token, never to the message id alone: ids are
sequential, so without the scope a visitor could rate, and therefore probe the
existence of, every answer ever given. It may be changed, because a rating that
cannot be taken back is one people stop giving. There is deliberately no "tell
us more" box — the specification offers one and a conversation is already the
place to say what was wrong.

**Three screens, all `role:admin`.** An overview, the unanswered list, and the
conversations. Blast radius rather than skill, the argument `campaign_manager`
and `store_manager` are both made with: a transcript holds whatever somebody
with no account typed into a box.

**The unanswered list is the point of the module.** §42 says the chatbot is not
an SEO mechanism — but its *failures* are, and each line is a question in a
visitor's own words for something this site does not answer. It is grouped by
the question rather than listed by the message, because forty people asking one
thing is one piece of work and ungrouped the most important row is the hardest
to see. Resolving a group carries every message id behind it.

**Nothing can edit or delete a transcript**, and the only thing that removes one
is the retention prune, which deletes by age — the rule the activity log
follows, because a record its own subject can tidy is evidence of nothing.

**Every rate is null, never zero, when nothing has been measured.** An
unanswered rate over no questions is not 0%. The rule the ticket dashboard's
medians and the store's averages already follow.

---

## What is not built

Phases 15–19: the performance and cost pass, the security testing pass, the UI
polish pass, integration testing and the production-readiness notes for Plesk.
Add-to-cart assistance beyond the product card's own button is deliberately not
coming: the card's button goes through the shop's own cart API, and giving the
assistant a basket of its own would be a second way to spend somebody's money.
