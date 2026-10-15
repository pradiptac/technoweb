# The website chat assistant

*Who can use this: Administrator.*

The assistant is a chat panel on the public site. A visitor asks a question in
their own words and gets an answer drawn **only from your own website** —
your pages, FAQs, knowledge base articles and products — with links to where
the answer came from. It can also collect the visitor's details first and
pass them to your sales desk as a lead, and hand the conversation over to
WhatsApp.

It is **off** by default, because switched on it sends every question to an
outside AI service — which costs money, or uses up a free allowance, on every
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

The answers are written by an AI model, which the site reaches through a
service called **OpenRouter**. You need an OpenRouter account and its API
key, and — inside that OpenRouter account — a key from the company whose
model you want to use (Google or OpenAI). Chapter 18, "API keys", walks
through getting both. Do these in this order:

1. Get the OpenRouter key and connect your Google or OpenAI key to it
   (chapter 18).
2. Paste the key into **System → Settings → API keys** (*OpenRouter API key*)
   and save. It is one key for every AI feature — this assistant, the AI SEO
   assistant (chapter 13), suggested alt text and page drafts. Saving it calls
   nothing: each is used only once it is switched on, and each keeps to its
   own daily ceiling.
3. On the same tab, choose **Model for the website assistant** and save.
   *Gemini 2.5 Flash (Google)* is the default and works with a free Google
   key.
4. Still on that tab, pick the same model under **Model to test** and press
   **Test this model**. Go on only when it says **The model answered**. If
   it says **OpenRouter refused the request**, the words under it are
   OpenRouter's own and say what is missing — most often that the Google or
   OpenAI key has not been added in your OpenRouter account.
5. Set **Replies per day** deliberately — it is the ceiling on your bill.
6. Write the **Greeting**, the **Suggestion chips** and **When it cannot
   answer**.
7. Only then set **Website assistant** to 1 and save.

Switched on before the key is saved, it answers every question with the same
stock sentence listing the pages it found — not a good first impression. Once
it is on, ask it one question your website answers: a properly written answer
proves the whole chain works.

### If you use a free Google key

A Google AI Studio key costs nothing, and it is what *Gemini 2.5 Flash* runs
on by default. Two things come with "free", and you should know both before
you switch the assistant on:

- **It has limits, set by Google**: so many requests a minute and so many a
  day. When a limit is reached, the assistant does not stop or show an error.
  It falls back to **listing the pages it found**, with links, instead of
  writing an answer — until the limit resets. A busy hour on the site, or a
  large batch of AI SEO suggestions run at the same time (chapter 13), is
  when you will meet it. If visitors often get links instead of answers, that
  is the sign you have outgrown the free key.
- **Google may use what is sent on a free key to improve its products.**
  Whatever a visitor types into the chat is sent, through OpenRouter, to
  Google. The assistant never sends customers' accounts, orders, tickets or
  licence codes — it cannot see them — but a visitor may type anything. A
  **paid** key avoids this. If the assistant will handle anything sensitive,
  use a paid key, and say in your privacy policy that chat messages are
  processed by an outside AI service.

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
| Replies per day | The ceiling that bounds your bill. 0 removes it — not advised. It is the site's own limit: a free Google key has Google's limits as well, which this number does not know about |
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
- Save the OpenRouter API key, and **test the model you chose**, before
  switching it on. A model your OpenRouter account cannot use fails on every
  message.
- An OpenAI model (*GPT-4o mini* and the others) works only when an OpenAI
  key, or paid credit, is on your OpenRouter account. The Google models work
  with a free Google AI Studio key added there.
- On a free key, a reached limit shows as links instead of written answers,
  and visitors' messages may be used by Google to improve its products.
- If the assistant suddenly answers everything with a list of pages, open
  **System → Settings → API keys** and press **Test this model** — it says
  why.
- Keep **Replies per day** set; it is the only thing that caps the bill.
- Switch it off from the console, not by any other means, or it may stay
  visible for a while.
- Leads from the assistant go to **Leads**, like every other enquiry.
- It is shown only on the public site, never in the console or the portal.
