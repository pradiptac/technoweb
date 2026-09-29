# The website chat assistant

*Who can use this: Administrator.*

The assistant is a chat panel on the public site. A visitor asks a question in
their own words and gets an answer drawn **only from your own website** —
your pages, FAQs, knowledge base articles and products — with links to where
the answer came from. It can also collect the visitor's details first and
pass them to your sales desk as a lead, and hand the conversation over to
WhatsApp.

It is **off** by default, because switched on it costs money on every
message. It lives under **Assistant** in the sidebar: **Overview**,
**Unanswered**, **Conversations** and **Settings**.

## How it answers

- It searches your published content for what the question is about.
- If it finds something, it writes a short answer from that material and links
  to the pages.
- **If it finds nothing, it does not guess.** It gives your "When it cannot
  answer" message instead, records the question on the **Unanswered** list,
  and (if you set a WhatsApp number) offers to continue on WhatsApp with the
  question already typed.
- It never sees customers' accounts, orders, tickets or licence codes, and
  cannot be talked into revealing them.

The quickest way to improve its answers is to **give it more to stand on**:
write knowledge base articles and FAQs for the questions on the Unanswered
list.

## Switching it on

It needs an account with an AI provider (currently OpenAI) and an API key.
Do these in this order:

1. Paste the key into **System → Settings → API keys** (*OpenAI API key*) and
   save. It is one key for every AI feature — this assistant and the AI SEO
   assistant (chapter 13). Saving it calls nothing: each is used only once it
   is switched on, and each keeps to its own daily ceiling.
2. In **Assistant → Settings**, choose the **AI model** (blank uses the
   server's default).
3. Set **Replies per day** deliberately — it is the ceiling on your bill.
4. Write the **Greeting**, the **Suggestion chips** and **When it cannot
   answer**.
5. Only then set **Website assistant** to 1 and save.

Switched on before the key is saved, it answers every question with the same
stock sentence listing the pages it found — not a good first impression.

To switch it off in a hurry, set **Website assistant** to 0 and save **in the
console**; it disappears from the site straight away.

## Settings

**Assistant → Settings** is grouped roughly as follows.

### What visitors see

| Setting | Notes |
|---|---|
| Assistant name | Shown on the panel. Blank uses your company name followed by "assistant" |
| Greeting | The first thing in the panel |
| Suggestion chips | Up to five buttons, one per line as `Label|what it asks` — e.g. `Need support|How do I raise a support ticket?` |
| When it cannot answer | The message used whenever nothing on the site matches |
| Open by itself / Wait before opening | Opens once per visit after a delay (at least 3 seconds). Off by default |
| WhatsApp number | With country code, digits only (`919876543210`). Adds a WhatsApp button that opens a chat with a message already written. Blank hides it |

### How it looks

| Setting | Notes |
|---|---|
| Assistant colour | The launcher button and the visitor's own bubbles. Blank uses your palette's brand colour |
| Assistant background | The colour behind the conversation. Blank uses the palest brand tint |
| Launcher icon | The symbol on the button |
| Text size | The size of the messages |
| Animation | How the button catches the eye until somebody opens it. Stops once opened |
| Show the name beside the button | Makes the button a pill carrying the assistant's name |

Text colours are worked out automatically to stay readable on whatever
colours you pick.

### Asking who the visitor is

With **Ask who the visitor is first** on (the default), the assistant greets
the visitor and asks a few questions, one at a time, before answering
anything. When it has them, it files a **lead** (chapter 10), so your sales
desk sees the enquiry with the whole conversation.

**The questions it asks** is one per line as `field|question`. Only five
fields are understood: `name`, `email`, `phone`, `company` and `requirement`.
The **last** question does two jobs: its answer is both the enquiry and the
first question the assistant answers. For example:

```
name|Hello! May I have your name?
email|Thanks. What is the best email address to reach you?
phone|And a phone number, in case it is quicker to call?
company|Which company are you with?
requirement|How can we help today?
```

- Every question can be declined ("skip", "no").
- A bad answer is asked for once more, never a third time.
- A signed-in customer is only asked the last question — their account already
  holds the rest.
- **Read the answers with the model** (on by default) lets the AI check each
  answer — rejecting keyboard noise, picking a name out of a sentence, and
  answering a question the visitor asks mid-way before repeating the step. It
  costs one small request per answer and never runs without a key or past the
  daily limit.

### Limits and costs

| Setting | Notes |
|---|---|
| Replies per day | The ceiling that bounds your bill. 0 removes it — not advised |
| Longest message (characters) | How much a visitor may type |
| Messages per conversation | The conversation closes at this |
| Earlier messages sent with each request | Context for follow-up questions; more costs more |
| Email unanswered questions | Emails the sales address each question it could not answer, with who asked. Off by default; a busy day is a lot of email |

How long transcripts are kept is not on this screen: it is **Keep transcripts
for (days)** under **System → Settings → Data retention**. Conversations older
than that are deleted automatically (at least 7 days).

## The Overview

**Assistant → Overview** shows a chosen period at a glance — conversations,
questions answered and not answered, callbacks asked for, how many answers
visitors rated helpful, what visitors came for, and where conversations
start. The **Today** block shows replies used against the daily limit
and how many are left, so you can see a busy day coming before visitors are
turned away.

## Unanswered questions

**Assistant → Unanswered** is the most useful screen here. Questions the site
could not answer are **grouped**: forty people asking the same thing is one
row with a count.

For each group you can:

- write a knowledge base article or FAQ that answers it, then press
  **Mark handled**; or
- press **Draft an article** to have a draft knowledge base article written
  from the questions. This needs the AI SEO assistant switched on in SEO →
  Settings; otherwise the button says why it cannot. It is saved as a draft,
  with `[CHECK: …]` wherever a fact is needed — the AI is given no facts, so
  you must fill them in and check the whole article before publishing. The
  group is marked handled, and the row becomes a link to the draft.

## Conversations

**Assistant → Conversations** lists every transcript. Search them, or filter
to conversations that produced a lead or contained an unanswered question.
Open one to read it in full.

Transcripts cannot be edited or deleted by anybody; they are removed only when
they reach the age set in **Keep transcripts for** (System → Settings → Data
retention). Remember that visitors
type whatever they like into a chat box — treat transcripts as personal data.

## Things to know

- It only knows what is published on your site. Better content, better
  answers.
- It never invents an answer: nothing found means your fallback message.
- Save the API key before switching it on.
- Keep **Replies per day** set; it is the only thing that caps the bill.
- Switch it off from the console, not by any other means, or it may stay
  visible for a while.
- Leads from the assistant go to **Leads**, like every other enquiry.
- It is shown only on the public site, never in the console or the portal.
