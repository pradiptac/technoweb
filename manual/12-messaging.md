# Messaging: WhatsApp, RCS and browser push

*Who can use this: Campaign manager, Store manager and Administrator. Messaging → Settings (providers and keys): Administrator only.*

Besides email, your site can tell customers things on three other channels:

- **WhatsApp**;
- **RCS** — the rich messages of Android's Messages app;
- **browser push** — notifications from your website in the visitor's browser.

Every email the site sends still goes out as before. Messaging adds these
channels **beside** it, for the people who asked for them. It lives under
**Messaging** in the sidebar: **Templates**, **Automations**, **Broadcasts**,
**Contacts** and, for administrators, **Settings**.

Every channel needs an account with an outside provider. Until a channel has a
provider and its keys, it is simply off: nothing is sent on it and no customer
is offered it.

## Consent comes only from the customer

Nobody receives a message on these channels unless they asked for it
themselves:

- a tick box under the mobile number at the **checkout** (and on the engineer
  visit form) — one per channel that is working;
- switches in their **portal profile**;
- the **bell** on the shop and in the portal, for browser push.

Staff cannot add people. **Messaging → Contacts** shows who opted in to what,
and you can only **record an opt-out** somebody told you about by other means.
A customer replying **STOP** (or UNSUBSCRIBE, CANCEL, END, QUIT, OPT OUT) on
WhatsApp or RCS is opted out automatically. To opt back in, they tick the box
again themselves.

## Setting up a channel

An administrator opens **Messaging → Settings**. It has two tabs:
**Channels** (a **Provider** for each channel, its keys, the webhook secret
and the quiet hours) and **Browser push**.

### WhatsApp

Choose one provider:

| Provider | What you need from their dashboard |
|---|---|
| Meta WhatsApp Cloud API | The phone number ID and WhatsApp Business account ID (API Setup page), a **permanent** system-user access token (not the 24-hour one), the app secret, and a verify token you make up |
| Gupshup | The app's API key, app name, app ID and sender number |
| Twilio | Account SID, auth token and the WhatsApp sender number |

### RCS

| Provider | What you need |
|---|---|
| Google RCS Business Messaging | Your launched agent's ID, the JSON key of a service account with the RBM API enabled, and the client token you set on the agent's webhook |
| Gupshup | The enterprise user ID, password and bot ID from Gupshup |

### Browser push

Push uses **Firebase Cloud Messaging**. You need a Firebase project with a web
app:

1. On the Channels tab, choose **Firebase Cloud Messaging** as the Browser
   push provider and paste the **service account JSON key** (Firebase →
   Project settings → Service accounts → generate a key).
2. On the **Browser push** tab, paste the web app's **API key, Project ID, Sender
   ID, App ID** (Project settings → General → your web app) and the **Web Push
   certificate key** (Cloud Messaging → Web configuration).

The bell appears on the shop and in the portal once all of these are set.

### For every channel

1. Paste the keys and save. Keys are encrypted and never shown again; leaving
   a key box blank keeps the saved one.
2. The screen shows each provider's **webhook address**. Enter it in the
   provider's dashboard, so delivery reports and STOP replies reach your site.
   For Gupshup, first set the **Shared secret** under **Webhook secret** on
   this screen — it is added to the end of the address.
3. Under **Send a test to**, enter your own mobile number (or, for push, a
   registration token) and press **Send**. Save first: the test uses what is
   saved. A refusal is shown in the provider's own words, and stays as a
   red banner until a test or a send succeeds.
4. Set the **Quiet hours** (**Opens at** / **Closes at**) — the window
   promotional messages keep to (09:00 to 21:00 by default, in the site's
   time zone — India time unless your installer changed it). Order updates
   and other transactional messages are sent at any hour; promotional ones
   wait for the window to open. The same window applies to basket-reminder
   and wishlist emails.

## Templates

**Messaging → Templates** holds the wording of each message. Each template
belongs to one channel. A template is plain text with placeholders in double
braces — for example `Hi {{first_name}}, order {{order_number}} is on its
way.` Choose an event under **Placeholders for** and the editor offers the
placeholders it understands as chips; it also shows a phone preview filled in
with sample values.

**WhatsApp templates must be approved by Meta** before they can be sent:

1. Write the template and save.
2. Press **Submit for approval**. Its status becomes *Waiting for approval*.
3. Approval normally takes minutes to a day. Press **Sync WhatsApp
   approvals** on the template list to read the latest status from the provider (it is also updated automatically when the
   provider reports it).
4. Only an *Approved* template is ever sent.

Editing the reviewed wording of a submitted WhatsApp template puts it back to
*Not submitted* — Meta only approved the old words. RCS and push templates need
no approval. With Gupshup RCS, templates are approved on Gupshup's own
dashboard; enter each one's **Template code** here (under **At the
provider**).

**Send test** on a saved template sends it, filled with sample values, to a
number you give.

## Automations

**Messaging → Automations** is a grid of **events** against **channels**. For
each pair, choose a template, switch it on, and press **Save automations**.

The events are: Order placed, Order paid, Order dispatched, Reply on a ticket,
Basket reminder (first and second), Wishlist item back in stock, Wishlist item
price drop, Visit requested, Visit confirmed or moved, and Visit tomorrow
(reminder).

A message is sent only when all four are true: the automation is switched on,
its template is sendable (approved, for WhatsApp), the channel is set up, and
the customer has opted in on that channel. Under a switched-on pair, the grid
says what is still missing.

Order messages go to the mobile number typed on that order, so they reach the
person who placed it.

## Broadcasts

**Messaging → Broadcasts** sends one message to many people at once — a sale,
a closure notice.

1. **New broadcast.** Give it a **Name**, choose the **Channel**, an
   approved **Template** and the **Audience**, and press **Create draft**.
   The audiences are:
   - everybody opted in on the channel;
   - portal customers who opted in;
   - a newsletter group (its subscribers who are also opted-in customers);
   - customers holding a particular product on their wishlist.
2. The draft's **Send** section shows how many people that is. It is always
   narrowed to people who opted in on the channel.
3. Press **Send broadcast** to send now, or fill in **Schedule for
   (optional)** (India time) first. Broadcasts are promotional, so they go out
   only within the quiet hours, in batches.

Sending is refused if the template is not approved, the channel is off, or the
audience is empty. A broadcast can be cancelled (**Cancel**) while it is
scheduled or sending — whatever has not yet gone is skipped. Its report shows sent,
delivered, read and failed, with the latest failures.

## Things to know

- Nobody receives these messages without opting in themselves; staff can only
  record opt-outs.
- A WhatsApp template must be approved before anything is sent with it, and
  editing it sends it back for approval.
- Promotional messages wait for the quiet hours; transactional ones do not.
- A message waiting for the window is checked again when it is due — if the
  customer opted out in the meantime, it is skipped.
- Delivery reports and STOP replies only reach you if the webhook address is
  entered in the provider's dashboard.
- Provider charges are billed by the provider; broadcasts to large audiences
  can cost real money.
