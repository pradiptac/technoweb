# Settings, email templates and webhooks

*Who can use this: Administrator.*

Settings are split between a few screens. **System → Settings** holds what the
whole console shares; each module keeps its own settings as the last row of
its sidebar section. This chapter covers the shared ones, the site-wide ones
under **Site → Settings**, the email templates and webhooks.

| Screen | Tabs |
|---|---|
| **System → Settings** | General, Contact, Social profiles, Reference numbers · Sign-in screen, Sign-in, Sign in with Google · Outgoing mail, API keys · Data retention |
| **Site → Settings** | Homepage, Colour palette, Motion, Page banners, Embeds, Analytics, Cookie consent |
| **Store → Settings** | Store, Basket reminders, Payments, Zoho Books (chapter 07) |
| **Campaign → Settings** | Newsletter (chapter 11) |
| **SEO → Settings** | SEO defaults, IndexNow (chapter 13) |
| **Assistant → Settings** | Website assistant (chapter 16) |
| **Messaging → Settings** | Channels, Browser push (chapter 12) |
| **Tickets → Email to ticket**, **Customers → Portal**, **Leads → Scoring**, **Visits → Visit settings**, **Blog → Settings**, **Content → Media settings**, **System → Backup settings** | See their chapters |

A few things are true on every settings screen:

- **Ctrl + K** opens the console's search, which finds any setting by name and
  jumps straight to it.
- **Secrets** (passwords, API keys) are encrypted and never shown again once
  saved. Leaving a secret box blank keeps the saved value; to remove one, use
  the clear button beside it.
- A change saved here reaches the website **at once**. A setting changed any
  other way (directly in the database) can take up to ten minutes to show.
- Anything that is simply on or off is a small **switch**: press it (or tab
  to it and press Space) and it slides across. Coloured means on. Where a
  switch needs explaining, the line under it says what the state it is in
  means, and changes when you press it. Nothing is saved until you press
  **Save**.

## General

- **Company name** and **Tagline** — used across the site, in search results
  and in social previews.
- **Logo** — PNG or SVG with a transparent background, around 600 × 80.
- **Favicon** — the browser-tab icon, a square PNG or SVG (512 × 512).
- **Notice duration (seconds)** — how long a "Saved" notice stays on screen in
  the console. Failures stay until dismissed.

## Contact

**Phone**, **Support email**, **Sales email**, **Careers email**, **Address**
(line breaks are kept), **Map embed URL** and **Map link**.

- The support address receives new tickets; the sales address receives
  enquiries and leads. Check both are monitored.
- For the map: in Google Maps, choose *Share → Embed a map* and copy only the
  address inside `src="…"`. Only Google Maps embed addresses are accepted.
- The contact page shows the map only when a visitor presses to load it, so no
  Google cookies are set until then.

## Social profiles

Full web addresses for LinkedIn, X, Facebook, Instagram, YouTube, WhatsApp and
Reddit. Leave one blank and its icon disappears — far better than linking to a
profile that is not yours.

**How the icons are drawn** — *Flip tiles* spell a word (up to seven letters,
set in **Word on the flip tiles**) and turn into the icons under the pointer;
phones show the icons straight away. Or *Magnifying dock* — the icons in
tiles that grow under the pointer.

## Reference numbers

Ticket, engineer-visit and order numbers read `PREFIX-YEAR-NNNNN`. Set the
letters in front with **Ticket number prefix**, **Engineer visit prefix** and
**Order number prefix** — two to six letters or digits, starting with a
letter. At install the ticket prefix is your company's initials (Acme Networks
gives `AN-2026-00001`), the visit prefix the same initials plus V
(`ANV-2026-00001`), and orders start `ORD-2026-00001`.

A change applies to new numbers only. Existing tickets, visits and orders keep
theirs, and an email reply quoting an old ticket number still reaches that
ticket.

## Homepage

Under **Site → Settings → Homepage**:

- **Hero badge**, **Hero headline** (the last word is shown in the brand
  colour) and **Hero paragraph**.
- **Hero statistics** and **Support statistics** — the figures on the
  homepage, each a figure, a label and an optional icon. **The figures that
  come with the install are invented placeholders. Replace or remove them
  before launch.**
- **Figure colour**, **Figure size** and **Figure animation** (how the figures
  arrive as they scroll into view).
- The **"Why us" block** — kicker, heading, paragraph and **The steps** (one
  row per step, title and text).
- The **testimonial** beside the steps — a switch, the quotation, the author
  and their role.
- The **AMC card** under it — a switch, heading, list and link.
- **Stat bar section**, **Technology stack section** and **Pricing section** —
  choose a published content block to show on the homepage (chapter 05). Where
  they sit is set on **Site → Themes**.

Colour palette, Motion and Page banners are covered in chapter 15.

## Embeds

- **Google reviews widget (Elfsight)** — paste the whole snippet Elfsight
  gives you. It becomes the *Reviews* section of the homepage, with its own
  kicker, heading and intro; move or hide it on the Themes screen.
- **Code before `</body>`** — for a third-party widget whose instructions say
  to paste code before the closing body tag (a chat widget, a booking tool, a
  badge). It runs on every public page, never in the console or the portal.
  **It is not checked or cleaned** — paste only code from a supplier you trust,
  exactly as given.

## Analytics and cookie consent

Under **Site → Settings → Analytics**, paste the IDs from each service. Each
one loads only when its ID is filled in, and only on the public site — never
in the console or the portal.

| Field | Where to find it |
|---|---|
| Google Analytics (GA4) | The measurement ID, starting `G-` |
| Google Tag Manager | The container ID, starting `GTM-`. If Tag Manager already loads Analytics, leave the GA4 box empty or every visit counts twice |
| Google site verification | The *content* value from the meta tag Search Console gives you |
| Meta Pixel | The numeric Pixel ID from Events Manager |
| Meta domain verification | The *content* value from Business Manager's meta tag |

**Cookie consent** (on by default): no analytics loads until the visitor
accepts. The banner appears only when at least one analytics ID is set.
Set the heading, text, button labels and the link to your privacy policy.
**The wording that comes with the install is a placeholder, not legal advice**
— have it reviewed.

Analytics never loads on pages that carry a private link (order confirmations,
unsubscribe pages), so those links never reach a third party.

## Sign-in and Sign-in screen

See chapter 17 for sign-in by code or password, and chapter 15 for the
sign-in screen's background. **Sign in with Google** — letting customers use
their Google account on the portal — is set up here and explained in
chapter 9.

## Outgoing mail

Everything the site emails — ticket notifications, order confirmations,
sign-in codes, campaigns — leaves through the transport chosen here.

1. Choose **Send mail through**:

   | Transport | What it needs |
   |---|---|
   | SMTP server | Host, port, username, password and encryption from your mail provider. Works with almost any provider |
   | Gmail or Google Workspace | An OAuth client from Google Cloud, then **Connect a Google mailbox**. About 500 messages a day on a personal account, 2,000 on Workspace |
   | Brevo | An API key |
   | Mailgun | An API key, the sending domain, and the right region (the EU region is a different endpoint) |
   | Amazon SES | Not installed by default; the screen shows the command your supplier would run |
   | SendPulse | Your SendPulse login and its separate **SMTP** password (not your sign-in password) |
   | Write to the log — do not send | For testing only: nothing is sent |

2. Set the **From address** and **From name**.
3. Save.
4. In **Send the test to**, enter an address (blank sends to you) and press
   **Send**. A failure shows the mail server's own words — "Connection could
   not be established with host…" tells you exactly what to fix.

Test to an outside address such as a Gmail account: it proves the mail is
accepted by other providers, not just your own.

Leaving the transport unset uses whatever your hosting configuration says.

**Mail is sent in the background** by the site's scheduled tasks, within about
a minute. If the scheduled tasks stop, the screen warns **Mail is queued but
not being sent**; in that case the site falls back to sending during the
request, so nothing is lost, but pages that send mail become slower. See the
installation chapters for setting up the scheduled task.

A red banner at the top of this tab means a recent send failed. It stays until
a test succeeds.

### Connecting Google

For **Gmail or Google Workspace**, create an OAuth client (type: Web
application) in Google Cloud, add the callback address the screen shows, paste
the client ID and secret, save, then press **Connect a Google mailbox** and
sign in. Two things to know: Google's permission is full mailbox access (there
is no send-only option for this), and a Google project left in "Testing" mode
disconnects every seven days — publish it.

## API keys

Keys for outside services used by several modules:

| Key | Used by |
|---|---|
| OpenRouter API key | Every AI feature: the website assistant — its answers, and reading visitors' answers while it asks who they are (chapter 16) — and the AI SEO assistant — on a record's form, in bulk from the SEO overview, alt text in the media library, article drafts from the assistant's unanswered questions and page drafts (chapter 13). Nothing is called until **Assistant → Settings** or **SEO → Settings** switches one on, and each keeps its own daily ceiling. See "The OpenRouter key" below |
| Hunter.io API key | Newsletter address checking (chapter 11) |
| Search Console service account and property | The SEO overview (chapter 13) |
| Google Analytics 4 property ID | The SEO overview and the shop's overview (chapter 13) |

Each key has a test button that proves it works and reports any refusal in
the provider's own words. They test the **saved** value, so save first.

### The OpenRouter key

The site does not talk to an AI company directly. It sends every AI request
to one service, **OpenRouter** (openrouter.ai), which passes it on to the
company that makes the model you chose — Google for the *Gemini* models,
OpenAI for the *GPT* ones. So there are two kinds of key, kept in two places:

- the **OpenRouter key** goes here, in the console. It is the only AI key the
  site ever holds;
- **your own Google or OpenAI key** goes into your OpenRouter account, not
  here. OpenRouter calls this "bring your own key".

To set it up:

1. Create an account at openrouter.ai, open **Keys**, create a key and copy
   it.
2. Still at OpenRouter, open **Settings → Integrations** and add your own
   provider key:
   - a **Google AI Studio** key for the Gemini models. It is free to create,
     and it is all you need to start;
   - an **OpenAI** key for the GPT models. Without one — or paid credit in
     your OpenRouter account — a GPT model is refused.
3. In the console, paste the OpenRouter key into **System → Settings → API
   keys → OpenRouter API key** and **Save**.
4. On the same tab, choose the two models — **Model for the website
   assistant** and **Model for SEO, alt text and page drafts** — and
   **Save**. Then pick each under **Model to test** and press **Test this
   model**. It sends one very short request through the saved key.
   - **The model answered** — that model works with your keys.
   - **OpenRouter refused the request** — the words under it are OpenRouter's
     own, and say what to fix: usually that the Google or OpenAI key has not
     been added at OpenRouter, that the key is wrong, or that a free
     allowance is used up for now.
5. **Test every model you chose** — a model your account cannot use fails
   every time it is called, and nothing warns you until a visitor or an
   editor meets it. The key, both models and the test are all on this one
   tab; the switches that turn each assistant on are in **Assistant →
   Settings** (chapter 16) and **SEO → Settings** (chapter 13).

The models offered:

| Model | Works with |
|---|---|
| Gemini 2.5 Flash (Google) — used when you choose nothing | A free Google AI Studio key added at OpenRouter |
| Gemini 2.5 Flash-Lite (Google) — the quickest and lightest | The same |
| Gemini 2.5 Pro (Google) — the strongest and slowest; for content work, not for the chat assistant | The same |
| GPT-4o mini, GPT-4.1 mini, GPT-4o, GPT-4.1 (OpenAI) | An OpenAI key, or paid credit, in your OpenRouter account |

**A free Google key has two costs.** Google limits how many requests it will
take each minute and each day; when a limit is reached, the website assistant
answers with links to the pages it found instead of a written answer, and the
SEO assistant says the AI service did not answer — both recover by
themselves when the limit resets. And Google may use requests made on a free
key to improve its products, which includes whatever visitors type into the
chat. A paid key has higher limits and avoids the second. Chapter 16 says
more.

### After updating to 0.116.0

Before version 0.116.0 the site called OpenAI directly and this tab held an
*OpenAI API key*. From 0.116.0 it uses OpenRouter, and the update makes two
changes by itself:

- **The saved OpenAI key is removed.** An OpenAI key does not work at
  OpenRouter, so it is not carried over.
- **A model you had chosen is kept**, under OpenRouter's name for it
  (*GPT-4o mini* stays GPT-4o mini). If you had left the model blank, it
  now means *Gemini 2.5 Flash (Google)*. Both model choices have moved to
  **System → Settings → API keys**, beside the key.

**Until you save an OpenRouter key, every AI feature is off**: the SEO
assistant's buttons answer "No OpenRouter key is configured", and the website
assistant answers every question with links to pages instead of a written
answer. Nothing else on the site is affected. To put them back:

1. Follow steps 1 to 4 of "The OpenRouter key" above.
2. Look at the two models on **System → Settings → API keys**.
   If it names an OpenAI model, either add your **OpenAI key at OpenRouter**
   (Settings → Integrations), or — if you will use a free Google key instead
   — change it to a Gemini model and save.
3. Press **Test this model** for the model you ended up with.

## Data retention

How long records are kept before they are deleted automatically each night:
the activity log, job applications (with their CVs), website assistant
transcripts, JavaScript errors, spam or binned blog comments, and AI SEO
suggestions. Each has a minimum the site enforces whatever
you type, so a typo cannot wipe a trail.

## Email templates

**System → Email templates** lists every email the site sends — over sixty,
from ticket acknowledgements to order receipts to sign-in codes. For each you
can:

- **Wording** — write your own subject, message and plain-text version, then
  switch on **Use this wording**. Off, the built-in text is used. **What you
  can drop in** lists the placeholders for that email (the customer's name,
  the order number and so on).
- **Send this message** — switch it off and nobody receives that email at
  all. Use sparingly: somebody is usually expecting it.
- **Copies and sender** — **CC** and **BCC** addresses (up to ten each), and
  a different **From name** or **From address** for this email only.
- **Preview** shows your draft; **Send test** sends it to you, even if the
  message is switched off.
- Resetting the wording puts the built-in text back but keeps your switch,
  copies and sender.

The list shows each email as *Built in*, *Customised*, *Customised, off* or
*Not sent*.

Three emails are **locked**: the email-address confirmation, the password
reset and the sign-in code. They carry a secret somebody is waiting for, so
they cannot be switched off or copied to anyone else. Their wording can still
be changed.

A different **From address** must be one your mail provider is authorised to
send as, or the email lands in spam without any error.

## Webhooks

**System → Webhooks** lets another system — a CRM, an accounting package, an
automation service — be told the moment something happens on your site.

1. Press **New webhook**. Give it a name, the receiving system's address
   (**https** only) and tick the **events** it wants:

   | Event | When |
   |---|---|
   | A lead arrived | Any enquiry, form or chat callback |
   | A ticket was opened / replied to / changed status | Support desk activity (never internal notes) |
   | An order was placed / paid / changed status | Shop activity |
   | A customer confirmed their address | A new portal account |
   | A form was submitted | Answers to a form you built |
   | A newsletter subscriber joined | However they arrived |
   | An engineer visit was requested | A new visit request |

2. Press **Create webhook**. The **signing secret** is shown **once** — copy
   it into the receiving system, which uses it to check that each message
   really came from your site.
3. Press **Send a ping** to test the connection.

Each webhook lists its **deliveries** for the last thirty days, with the
answer the other system gave. A failed delivery is retried five times over
about fifteen hours; after that it is marked failed and the error is shown on
the webhook. **Redeliver** sends one again. You can rotate the secret at any
time — the receiving system must then be given the new one.

Webhooks are refused for addresses on private networks, and never delay or
break anything on your site: if the other system is down, your customer's
order still goes through.

## Things to know

- Save secrets once; they are never shown again.
- The AI features need an **OpenRouter** key — an OpenAI key pasted here does
  not work. Your Google or OpenAI key belongs in your OpenRouter account.
  Test the model you chose after saving.
- Replace the invented homepage statistics before launch.
- Test outgoing mail to an outside address after any change.
- Code pasted into **Code before `</body>`** runs on every public page
  unchecked.
- The cookie banner's wording is a placeholder; have it reviewed.
- A webhook secret is shown once — copy it before leaving the screen.
