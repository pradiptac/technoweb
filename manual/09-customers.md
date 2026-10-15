# Customers and the portal

*Who can use this: Support engineer and Administrator. Customers → Portal (the portal's settings): Administrator only.*

A **customer** is anybody with an account on your customer portal — the
signed-in area where people raise support tickets, see their orders, keep
their addresses and manage what messages they receive. One account covers
everything: somebody who raised a ticket last year and somebody who bought
from the shop yesterday are the same kind of account.

Customer accounts are completely separate from **staff** accounts (chapter
17). A customer can never reach the console, and a staff login does not work
on the portal.

The screens are under **Customers** in the sidebar: **Customers** (the list
and the approval queue) and, for administrators, **Portal** (its settings).

## Where accounts come from

| How | Status on arrival |
|---|---|
| The person registers on the portal (if registration is open) | Waits for email confirmation, then active — or waits for approval, if you require it |
| The person presses **Sign up with Google** (if you have switched Google sign-in on) | Active straight away, since Google has already confirmed the address — or waits for approval, if you require it |
| The person pays for a shop order | Active |
| The person emails your support mailbox (with email-to-ticket on) | Active, unless you chose to ignore unknown senders |
| An administrator creates one from the server's command line | Active |

## Account statuses

| Status | Meaning | Can sign in? |
|---|---|---|
| Pending approval | Waiting for somebody to approve it | No |
| Active | Normal | Yes |
| Rejected | You turned the registration down | No |
| Suspended | You switched the account off | No |

When somebody who cannot sign in tries, the portal tells them why in plain
words — "confirm your address", "waiting for approval", and so on — rather
than a vague error.

## The portal's settings

An administrator opens **Customers → Portal**. Each setting is an on/off
switch:

- **Customer portal enabled** — switches the whole portal off. Customers
  can no longer sign in, register or reset a password, anybody already
  signed in sees a "portal closed" page on their next click, and every link to the portal
  (Customer login, Track a ticket) disappears from the website. A guest can
  still buy from the shop and ask for an engineer visit. Your staff and the
  console are not affected.
- **Self-registration enabled** — whether anybody can register. With it off,
  accounts come only from orders, emailed tickets, or your supplier.
- **Customer account activation required** — whether a newly registered and
  confirmed account waits for a person to approve it. **Off by default**:
  a confirmed email address is enough. Switch it on if only customers with a
  support agreement should have portal access. The registration form tells
  people which of the two to expect.

How customers sign in (a one-time code by email, or a password) is set for
staff and customers together in **System → Settings → Sign-in** (chapter 17).

## The approval queue

**Customers → Customers** shows **pending** accounts first, oldest first. A
button such as **3 waiting for approval** at the top opens just those. You can
also filter by status or by whether the email address is confirmed, and
search by name, email or company.

1. Open a pending account. Check the name, company, email and whether the
   address has been confirmed.
2. Press **Activate this account** — the customer is emailed that they can
   sign in.
3. Or press **Reject**, with a note for your colleagues explaining why. The
   customer gets a neutral email, and every session they had is ended.

You can approve an account whose email address has not been confirmed yet —
for example after speaking to the customer on the phone. The console warns
you before you do.

## Managing an account

Open any customer to see their contact details, when they registered,
confirmed, were activated and last signed in, and how many tickets they have
(the number opens them in the ticket queue).

- **Edit** the name, email, company and phone, then press **Save details**.
  Changing the **email** marks it unconfirmed again and sends a confirmation
  link to the new address.
- **Suspend** an active account (with a note) to stop it working. Suspending
  ends every session at once and sends no email. **Reactivate this account**
  switches a suspended or rejected account back on.
- **Resend the confirmation email** (shown while the address is unconfirmed)
  sends the confirmation link again.
- The **note** you write when rejecting or suspending is for staff only; the
  customer never sees it.
- **There is no delete.** A customer's account holds their tickets and orders,
  and deleting it would either orphan or destroy that history. Suspend instead.

## "View as"

**View as** on the list, or **Open the portal as this customer** on the
customer's record, opens the portal in a
new tab, signed in **as that customer**, so you can see exactly what they see
while you help them.

- It works only for **active** accounts.
- It lasts **one hour**, and a banner across the portal reminds you whose
  account you are in. Press **End** to finish; you return to the customer's
  record in the console.
- It does **not** sign the customer out of their own browser, and it does not
  change their "last signed in" time.
- You can do nearly everything they can — including placing an order to
  reproduce a problem — **except change their email address**.
- Using it is recorded in the activity log.
- The new tab replaces any portal session that browser already had.

## Addresses and GSTIN

Each customer can keep a **billing address**, a **delivery address** (or "same
as billing") and a **GSTIN** on their account, from their portal profile. None
of these is required on the account; the shop's checkout is where an address
becomes compulsory.

- The checkout opens already filled in with the saved details, and saves the
  latest ones back when a signed-in customer orders.
- Every order keeps **its own copy** of the addresses it was placed with. An
  invoice for last year's order still shows last year's address after the
  customer moves.
- A GSTIN is checked for the right shape only; it is not looked up with the
  government.

## Company names

When somebody registers, the company box suggests company names already on
file as they type (after three letters). This stops the same firm being
spelled three different ways over three registrations.

## Registration and privacy

The registration form never reveals whether an address already has an
account: it gives the same answer every time. If somebody tries to register an
address that already exists, the real account holder is emailed instead. This
stops strangers from using the form to discover who your customers are.

An account that has never confirmed its email address is not trusted: a paid
guest order or an emailed ticket from that address waits, and joins the
account only once the mailbox owner confirms it. The first confirmation also
replaces whatever password the account was registered with, because nobody
had proved it belonged to the mailbox owner — the customer then signs in with
a code or sets a password through "Forgot your password?".

## Things to know

- Approval is **off** by default: switch on *Customer account activation
  required* if only approved customers should get in.
- Customers cannot be deleted; suspend them.
- Changing a customer's email sends them a new confirmation and they must
  confirm it.
- "View as" lasts an hour, cannot change the email address, and is logged.
- A new approval queue is only useful if somebody watches it — make sure
  whoever handles support knows to look at **Customers** daily.

## Sign in with Google

Customers can sign in to the portal, and register, with their Google account
instead of a code or a password. It is off until you set it up. Staff sign-in
to the console is not affected.

**Setting it up** (an administrator, once):

1. In **Google Cloud Console** (console.cloud.google.com) choose or create a
   project, then open **APIs & Services → OAuth consent screen** and fill in
   your company's name and support email. Choose **External**, and publish
   it — left in "Testing", only the test users you list can sign in.
2. Open **APIs & Services → Credentials → Create credentials → OAuth client
   ID**, and choose **Web application**.
3. In this console open **System → Settings → Sign-in → Sign in with
   Google**. Copy the **Authorised redirect URI** shown there and paste it
   into Google under *Authorised redirect URIs*, exactly as written.
4. Google gives you a **client ID** and a **client secret**. Paste both into
   the same settings screen, tick **Offer "Continue with Google"**, and save.

The button now appears on the customer sign-in screen (*Continue with
Google*) and on the registration screen (*Sign up with Google*).

**What happens when a customer uses it:**

- If an account already uses their Google email address, they are signed in
  to it. Nothing about the account changes, and they can still sign in with
  a code or a password.
- If no account uses that address, one is created with the name Google
  gives — provided registration is open. If you require approval, the
  account waits in your approval queue as usual and you are emailed.
- If registration is closed, they are told to contact you.
- A suspended or rejected account is refused, as with any sign-in.

The customer's screen in the console shows **Google sign-in: Linked** once
they have used it.

Things to know:

- The redirect address must match exactly. If you change your website's
  domain, or move between `www` and no `www`, add the new address in Google
  as well.
- If the button is ticked but does not appear, the client ID or the secret
  is missing — the settings screen says so.
- The client secret is stored encrypted and never shown again. To replace
  it, type the new one and save.
