# Ask ALTIS — the console copilot

0.177.0, the first of the "smart" half of the 2.0 roadmap. A question typed in
the console, answered out of this install's own figures: "how many tickets are
open", "what is waiting to be dispatched", "how much has the shop taken this
month". A drawer beside the "?" — the help drawer answers *how a screen works*,
this one answers *what is happening right now*.

## The model's entire output is an index

**It is shown a list of question labels and answers with one number.** It never
sees a figure, a customer, an order, a price or a word of anybody's data; it
cannot compose a query; nothing it returns is executed, interpolated or
rendered. PHP builds every figure and every sentence, from the same scope the
screen the answer links to uses.

That was chosen over the obvious alternative — a copilot that writes its own
query — on one argument. A query-writing copilot answers questions nobody
anticipated and **cannot be trusted on any of them**: there is no review step
between the model and the number somebody acts on, and a plausible wrong total
in a console is worse than no answer, because it gets written down. Here the
worst a misclassification can do is answer a different question, and the
question it answered is printed above the figure — a failure a person sees
rather than one they cannot.

The consequence is the ceiling, and it is written down rather than discovered:
**the copilot can only answer what somebody wrote down.** Adding a question is
one entry in `Questions`, and until somebody adds it the answer is "that is not
something I can answer" plus the list of what is.

## The rules go first, and usually win

`App\Support\Copilot\Copilot::match()`:

1. **Words.** The asking is lower-cased, split on non-alphanumerics, crudely
   singularised (`strlen > 3 && ends with "s"` — "ticket" and "tickets" must
   score the same, and a stemmer for eight nouns is a dependency), and a noise
   list is removed: every question here is "how many" something, so `how`,
   `many`, `what`, `is`, `the`, `show`, `tell` and the rest carry no signal.
   Each question is scored by how many of its own vocabulary words the asking
   uses, **divided by the asking's length, not the question's** — a question
   carries twenty phrasings and an asking carries three, so scoring against the
   question's list would put every score near zero and make the threshold
   meaningless. At or above `SURE` (0.45) the rules answer.
2. **The model**, when the SEO assistant is on, has a key and is under its
   daily cap — the same switch, key, model, cap and counter, because a second
   AI integration for one feature is a second thing to configure.
3. **A weak word match**, if there was any overlap at all. Better than nothing,
   but only *weak*: with no overlap the copilot says so rather than answering a
   question nobody asked.

So the feature works on an install with no OpenRouter key, costs nothing for
the common case, answers in milliseconds, and `source` (`words` / `model` /
`none`) says which answered.

**A run is counted only when it is used.** A refusal, an outage, an unreadable
reply and an index out of range are all free and all fall through to step 3 —
the rule `SeoAssistant` already follows. The provider's own words name models
and quotas, so they go to the log and never to a person.

**The asking is fenced and the marker stripped out of it first**, the chatbot's
rule. It buys little here — the only thing the model can return is a number,
and one out of range is dropped — and it costs one line, and the next person to
widen this is not guaranteed to keep that property.

## Every question is an existing scope

`App\Support\Copilot\Questions` is the one list: twenty questions, each a
`Question` with a `key`, the `role` that may ask it, the `label` the drawer
shows, the `words` it is matched on, and a closure that answers.

**No answer here computes anything of its own.** `Ticket::open()`,
`Lead::overdue()`, `Order::scopePaid()`, `StoreProduct::outOfStock()`,
`OrderReturn::waiting()`, `QueueHealth::read()` — the scope the list screen
uses, so the copilot's figure and the screen's count cannot disagree. A new
question that needs a figure nothing else shows is a sign the figure wants a
screen first.

Each answer is `{figure, sentence, href}` through one private helper:

- **`figure` is the number**, and the sentence repeats it — the drawer draws
  the figure large and the sentence under it, and a sentence that only says
  "7" reads as a fragment when the figure is right above it.
- **`href` is null when the figure is zero.** "Open the list" on a list with
  nothing in it is a link to an empty state, and an empty state is not an
  answer to "is there anything waiting".
- **The zero sentence is written out**, never the some-sentence with a 0 in it:
  "No tickets are open." rather than "0 tickets are open."

## Role, and what a role never learns

The routes are **staff-wide**, like `/admin/search` and `/admin/new-since`, and
for the same reason: every role has questions of its own, and a role-gated
route would have to pick one to belong to. `Questions::for($roles)` narrows the
list **before the words are matched and before the model is shown anything**.

So a support engineer asking about revenue is not refused — it is not a question
that exists for them, the model is never offered it, and the suggestion list
they are shown never names it. An administrator passes every role check
implicitly, as everywhere.

## The drawer

`web/src/components/admin/copilot-drawer.tsx`, mounted by the admin layout
beside `HelpDrawer`. A `Modal size="side"`; `IconSparkle` from `sm`, the
account menu below it (`AccountItem.event`/`phoneOnly`), and `tw:copilot` on
`window` from anywhere.

**Every word a person reads in it is the API's.** The sentence, the figure and
the link arrive formed; nothing is composed in the browser, no figure is
formatted there, and nothing a model wrote is rendered. The suggestions are
`GET /api/admin/copilot` — the list this account may ask — and the drawer lists
nothing of its own, the rule every options list in this console follows.

Its answer is `role="status"`, not `alert`: it is the reply to something
somebody just asked for, so it waits for a gap rather than interrupting.

**The route handler is a route handler, not a Server Action**, for the
palette's reasons: the staff token is in an httpOnly cookie the browser cannot
read, and an answer must never be cached — it is a figure about this minute, so
both calls are `no-store` on both sides. The `POST` checks `Origin`
(`isSameOrigin`) although it writes nothing: it can reach a model, and a
cross-site page quietly spending somebody's daily cap is what the check costs
one line to prevent.

## Deliberately out

- **Writing anything.** The copilot reads. "Close these three tickets" is a
  different feature with a different risk, and the console already has bulk
  actions with a confirmation.
- **Free-form querying.** The reasoning is the whole first section.
- **A conversation.** One question, one answer. A thread would mean the model
  carries context, and context is where a figure from the last answer gets
  re-stated as a fact about a different question.
- **Charts.** The answer links to the screen that draws them.
