# Writing help

*Who can use this: Administrators switch it on. Editors, support engineers and campaign managers use it where they already work.*

**Writing help** is an assistant in the places where you type. It can write a
first draft from a line about what you want, reword what you have, make it
shorter or longer, correct spelling and grammar, or change the tone. It never
changes anything by itself: every suggestion opens in a **preview**, and nothing
is placed in your page, ticket or email until you press **Replace** or
**Insert below** — and a record is not saved until you press its own **Save**.

## Where it is

| Where | What you see | Who |
|---|---|---|
| The body editor of pages, posts, knowledge articles, case studies, solutions, services, products, shop products, events, vacancies, tenders, landing pages and your own content types | An **AI** button in the editor's toolbar | Whoever can edit that kind of record |
| The summary, excerpt or short description above the body | A small **Writing help** row above the field | The same |
| A ticket's reply box | **Draft a reply** | Support engineers |
| A newsletter campaign | A button on each heading, text, button and columns block, and **Suggest subject lines** above the subject | Campaign managers |
| System emails (Settings → Email templates) | A button above the subject and in the body editor | Administrators |

If you cannot see these buttons, writing help is switched off, or you do not
have the role for that screen. Nothing appears at all while it is off.

## Switching it on

Writing help uses the same switch and the same **OpenRouter key** as the AI SEO
assistant (chapter 13, and "API keys" in chapter 18), so there is nothing new to
connect.

1. Make sure the OpenRouter key is saved on **Settings → API keys** and that
   **Test this model** works.
2. Open **SEO → Settings** and turn on **AI SEO assistant**.
3. On the same screen set the three things that are for writing help:
   - **Writing help requests per day** — its own ceiling, separate from the SEO
     assistant's, so a busy support desk cannot use up the SEO team's day. The
     default is 300. **0 switches writing help off** without touching the SEO
     assistant.
   - **House style** — a line or two every suggestion follows, for example
     "Plain, confident, Indian English. No hype." Up to 500 characters.
   - **Words to avoid** — one word or phrase per line (up to 50). Writing help
     will not use them.
4. **Save SEO settings.** The buttons appear the next time a page is opened.

## Using it

1. In a body editor, **select** the words you want to change — or select nothing
   to work on the whole text. Press **AI**. (In a summary, a reply box or a
   campaign block, just press the button.)
2. Choose what to do:
   - **Write** — a new draft from a line you type under **What should it say?**
   - **Rewrite** — says the same thing better.
   - **Shorten** — about half the length.
   - **Expand** — fuller, by explaining, not by adding facts.
   - **Fix grammar** — spelling, grammar and punctuation only.
   - **Change tone** — keeps the meaning; choose **Formal**, **Friendly** or
     **Plain** under **Tone**.
3. Press **Suggest**. Read the preview.
4. **Replace** swaps your selection (or the whole text, or the field) for the
   suggestion. **Insert below** adds it after what is there. **Discard** throws
   it away. Suggest again as often as you like.
5. **Save** the page as you always do.

Whatever you choose, **tone** can be changed in any mode, and the house style is
always applied.

### What it keeps and what it changes

- **Links and pictures stay where they are** and keep their addresses, even
  when the words around them change.
- **Tables, videos, embedded code and `[shortcodes]` are never touched.** They
  come back exactly as they were. If the assistant changes one, the suggestion
  is refused and you are asked to try again.
- Alignment, underline, strike-through, sub- and superscript and colours are
  **not carried** through a Rewrite, Shorten or Expand. To keep them, select
  only the words you want changed.
- A suggestion that would change nothing is refused with "The assistant
  suggested no change."

### `[CHECK: …]`

The assistant is told never to make up a fact, figure, price, date, name or
promise. Where it needs one it was not given, it writes
**`[CHECK: what to confirm]`** instead, and the preview shows a yellow
"Unchecked facts" note. **Replace every one of them with the real answer before
you save or send** — they will otherwise be published as written.

## Drafting a ticket reply

On an open ticket, **Draft a reply** (above the reply box, for public replies,
not internal notes) writes a reply for the engineer to read, edit and send. Type
a line first if you want it to say something particular — "offer a visit
tomorrow" — or leave it blank and the conversation is the brief.

**What it reads:** the subject, what the customer wrote, the last twelve public
messages on the ticket, and a few **published** knowledge-base articles that
look relevant (it can name one with its title and address).

**What it never reads:** internal notes, any message marked **sensitive**, the
description of a sensitive ticket, attachments, and anything about the customer's
account or orders. Email addresses and phone numbers in what it does read are
replaced by "[email]" and "[phone]" before they leave your server; ticket
references, IP addresses, dates and version numbers are left as they are. What
you have already typed in the box is masked in the same way.

It will not draft for a closed ticket or one merged into another. It is told
never to promise a refund, a date, a price or a visit; where one is needed it
writes a `[CHECK: …]`. **Nothing is sent** — the draft lands in the reply box and
you press **Send** when you are happy with it.

## Newsletter campaigns

In the campaign editor, the button on a block rewrites **only its words**. A
button's link, a picture and every style choice stay as you set them; columns
come back in the same number and order. A block with a placeholder such as `{{first_name}}`
placeholder keeps it. **Suggest subject lines** offers three, each a button that
fills the subject; it reads the **saved** campaign, so save your changes first.

## System emails

On **Settings → Email templates**, the subject and the body can each be written
separately. An email can use only the placeholders it lists (the chips beside
the editor); a suggestion that invents another, or drops one you had, is
refused. The three emails that carry a sign-in or reset code cannot be written
by the assistant and show no button.

## The cost and the limit

Every suggestion is one request to OpenRouter, billed to your account at the
model's usual rate. The panel shows "**N of M** writing requests used today". A
suggestion that is refused or fails does not count, and nothing is counted
until a result appears. When the day's limit is reached the buttons go quiet
until midnight; raise **Writing help requests per day** if the default does not
suit.

## What is sent to OpenRouter

- The text you are working on, the **title** of the page it belongs to and, for
  a summary, the first part of the page's text.
- For a campaign block, the campaign's subject and the words of its other
  blocks. For an email template, its name, description and placeholder names.
- For a ticket, the items listed above, masked.
- Your house style, your words to avoid, and the line you type under "What
  should it say?".

**Never sent:** pictures, link addresses, passwords, keys, settings, customer
accounts, orders, prices or stock.

Choose a paid model rather than a free one: free models may keep what they are
sent.

## If something looks wrong

| You see | What it means |
|---|---|
| No button anywhere | Writing help is off, has no key, or its limit is 0. Check **SEO → Settings** and **API keys**. Reload the page after changing them. |
| "AI help is switched off" | The **AI SEO assistant** switch is off. |
| "No OpenRouter key is configured" | Add the key on **API keys**. |
| "The daily limit … has been reached" | Raise **Writing help requests per day**, or wait until midnight. |
| "The assistant changed part of the content it was asked to keep" | A table, video or shortcode in the text was altered. Press **Suggest** again, or select only the paragraphs you want changed. |
| "The assistant dropped the {{…}} placeholder" | Try again; the email or block needs that placeholder. |
| "The AI service did not answer" | OpenRouter or the model is busy, or your balance is empty. Try again shortly; **Test this model** on **API keys** shows the reason. |

## Limits of this release

- Replacing just a **selection** in the body editor is the part most worth
  checking by eye the first time you use it.
- **Suggest subject lines** does not see changes you have not saved.
- The buttons notice a change to the switch or the limit when a page is next
  opened, not while it is open.
- It writes in the language it is given; it does not translate, and it does not
  write SEO titles or descriptions (use the AI SEO assistant, chapter 13).
