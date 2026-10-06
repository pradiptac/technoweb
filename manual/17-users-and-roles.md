# Staff accounts, roles and signing in

*Who can use this: Administrator. Everyone can use **Your account** to manage their own sign-in.*

Staff sign in to the console at your website's `/admin` address. Each staff
member has their own account with one or more **roles**, and the sidebar shows
each person only what their roles allow. Customer accounts (chapter 09) are
completely separate: a customer can never sign in to the console.

## The roles

| Role | Can work on |
|---|---|
| **Administrator** | Everything, including staff accounts, all settings, email templates, the website assistant (Assistant), the Info bar and Themes, webhooks, imports, backups, updates and the activity log |
| **Support engineer** | Dashboard, Tickets, Customers (including "View as"), job Applications, engineer Visits, online Meetings |
| **Content manager** | Pages, Knowledge base, Case studies, FAQs, Media, Team, Clients, Certifications, Custom fields and content types, the Blog and its comments, the Catalogue, Menus, Sliders, Galleries, Popups, content blocks, Forms, Vacancies, Events and their registrations |
| **SEO manager** | SEO overview, Landing pages, Places, Redirects |
| **Campaign manager** | The newsletter (Campaign), Messaging |
| **Store manager** | The shop (Store), Messaging |
| **Sales manager** | Leads, engineer Visits, online Meetings and Meeting types, an event's registrations |
| **Meeting host** | Takes online meetings: offered to customers for booking in their working hours, and sees their own list under My meetings |

An **Administrator passes every role check**, so there is no need to give an
administrator other roles as well — with one exception: somebody is offered
to customers as a meeting host only if they hold **Meeting host** themselves,
administrator or not. Each module's **Settings** screen is for
administrators only, even where the module itself belongs to another role.

Give people the narrowest role that lets them do their job. The campaign and
store roles in particular are kept separate from content editing on purpose:
a campaign cannot be recalled once sent, and shop prices and codes cannot be
taken back once somebody has paid.

The sidebar hiding a screen is a convenience; the real protection is on the
server, which refuses anything a role is not allowed to do even if somebody
types the address.

## Managing staff

**System → Staff** lists every staff account. Filter by role, or search by
name or email.

To add somebody:

1. Press **New account**.
2. Enter their **name**, **email**, **mobile** (required) and tick their
   **roles**.
3. Leave **Password** blank to have one generated. With sign-in by code
   (below), they may never need it.
4. Save. A generated password is shown **once**, on the screen that follows —
   pass it on securely.

To change somebody, open their account: edit their details and roles, or
set **Active** to *No* to switch the account off without deleting it. Deleting an
account leaves their tickets in place, unassigned.

Three safety rules stop an install locking itself out:

- you cannot switch off or delete **your own** account;
- you cannot remove your own Administrator role;
- the **last active administrator** cannot be switched off, deleted or
  demoted.

Staff accounts created before mobile numbers were required are marked **No
number**; add one next time you edit them.

## Signing in: codes and passwords

By default, both staff and customers sign in with a **one-time code**: they
type their email address, a six-digit code is emailed to them, and they type
it in. A password form is a link away.

- A code lasts **ten minutes** and works once.
- **Five wrong entries** cancel the code; asking for a new code cancels the
  old one.
- The sign-in screen gives the same answer whether or not an account exists
  for the address, so it cannot be used to discover who has an account.
- Five wrong **passwords** in a row lock that account from that network for a
  while.

An administrator sets this under **System → Settings → Sign-in**:

| Setting | Meaning |
|---|---|
| Sign-in opens on | Whether the form starts at the code step or the password step |
| Customers sign in with a code | On or off for the portal |
| Staff sign in with a code | On or off for the console |
| Passwords still accepted | Whether passwords work at all |

**Be careful with two of these.**

- *Staff sign in with a code* makes a staff member's **mailbox** the only
  thing protecting the console. Anybody who can read that mailbox can sign in.
  Keep staff mailboxes well protected, or switch codes off for staff.
- *Passwords still accepted* switched off means codes are the **only** way in.
  If outgoing mail then breaks, **nobody can sign in — including you.** Leave
  passwords on unless you are certain mail is reliable. If it happens, your
  supplier can re-open staff passwords from the server.

Sign-in codes and password resets are sent immediately, not queued, so they
arrive even when other mail is waiting.

### Forgotten passwords

Staff use **Forgot your password?** on the console's sign-in screen; customers use
the one on the portal's. The two are completely separate. A reset link works
once and signs the account out everywhere.

## Your account

Everyone can open **Your account** (from their name in the header) to see
their details and **Change your password** — which needs the current
password.

## The activity log

**System → Activity** records what staff did: every sign-in, sign-out and
failed sign-in, every deletion and creation, and every change to staff,
customers and settings. Each entry shows who, when, what, and from which
address.

- Filter by action, or search by person, address or record.
- The log records **which** settings changed, never their values — no
  passwords or keys ever appear in it.
- Nobody can edit or delete an entry. Entries are removed only when they reach
  the age set in **System → Settings → Data retention** (at least 30 days).
- The name and email of the person are copied onto each entry, so the history
  survives even after their account is deleted.

## JavaScript errors

**System → JavaScript errors** collects errors that happened in visitors' and
staff members' browsers — on the public site, the portal or the console —
grouped so that the same error seen forty times is one row with a count.
Press **Dealt with** once a problem is fixed; if it happens again, it reopens
by itself. This screen is mainly for your supplier; if it fills up, send them
the details.

## Things to know

- Administrators can do everything; give it to as few people as possible.
- A generated password is shown only once.
- The last administrator cannot be removed or demoted.
- With codes as the only way in, broken mail locks everybody out.
- The activity log cannot be edited or cleared by anyone.
