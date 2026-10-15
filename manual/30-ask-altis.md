# Ask ALTIS: asking the console a question

*Who can use this: everybody who signs in. What you are shown depends on what
your account can open.*

Beside the **?** in the top bar is a **✦** button. The **?** tells you how the
screen you are on works; **✦** tells you what is happening in the business
right now.

Press it, type a question, and you get back the figure and a link to the screen
that shows it:

> **How many tickets are open?**
> **7**
> 7 tickets are open.
> [Open the list](#)

On a phone the button is not in the bar — open the menu under your name and
choose **Ask ALTIS**.

## What you can ask

The drawer lists every question your account can ask, and pressing one asks it.
That list is the whole of what it knows: there are about twenty questions,
covering the support queue, leads, the shop, content waiting to be published,
customers waiting for approval and whether email is going out.

You do not have to use the exact words. "anything overdue", "how many tickets
are late" and "overdue tickets" all find the same question.

If it does not recognise what you typed, it says so and shows you the list
rather than guessing:

> That is not something I can answer. Here is what I can tell you:

## What you are shown depends on your account

A support engineer is shown questions about tickets. A sales manager is shown
questions about leads. A store manager is shown questions about orders, stock
and what the shop has taken. An administrator is shown all of them.

This is not just the list being tidied: a question your account cannot ask does
not exist for it, so there is no wording that will get the figure out of it.

## Where the figures come from

**Every figure is read from your own records, by the same code as the screen it
links to.** If the drawer says 7 tickets are open, the ticket queue filtered to
open tickets shows those same 7. Nothing here is estimated, averaged or
remembered from earlier — it is counted when you ask.

The question it answered is always printed above the figure. If it has
understood you wrongly, you can see that immediately, because the question on
screen is not the one you asked.

## Does this need the AI settings?

**No.** Ask ALTIS works on an install with nothing in Settings → API keys. It
matches what you typed against the words of each question, which is enough
almost all of the time.

If you have switched the AI assistant on and pasted an OpenRouter key
(Settings → API keys — see [18 — Settings](18-settings.md)), an unusual
wording that the words miss can be understood as well. The note at the foot of
the drawer says which of the two you have.

When the AI is used, **all it does is pick which of those twenty questions you
meant.** It is never shown your tickets, your orders, your customers or any
figure, and it never writes the answer — the software does that from your own
records. An AI model cannot be asked a question nobody put on the list.

## What it will not do

- **It does not change anything.** It reads. Closing a ticket, dispatching an
  order or publishing a page is done on that screen.
- **It does not answer anything outside the list.** "Which customer spent the
  most in Kerala last March" is a reasonable question and not one of them; the
  reports under Store → Reports are where that kind of question is answered.
- **It does not hold a conversation.** One question, one answer. Ask the next
  one fresh.
