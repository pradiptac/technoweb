# Events: seminars, webinars and registrations

*Who can use this: Events — Content manager and Administrator. An event's registrations — Content manager, Sales manager and Administrator. Events → Settings — Administrator.*

The **Events** section of the sidebar is for anything with a date that people
attend: a seminar at your office, a webinar, a product demonstration, your
stand at a trade show. Each event gets its own page on your website, and your
`/events` page lists what is coming up and what has taken place.

Registration is **free** and optional. There are no paid tickets, and no
repeating events — each date is its own event (see *Running the same event
again*).

## Adding an event

Press **New event**. The form has seven tabs.

1. **Content** — the **Title**, a one- or two-sentence **Summary** (shown on
   the list and in search results), **About the event** (the full
   description), and the **Status**. Tick **Featured** to mark it out.
2. **When and where** — the **Format** (In person, Online, or both), when it
   **Starts** and **Ends**, and for an in-person event the **Venue**, **City**,
   **Address** and an optional **Map link**. For an online event enter the
   **Join link** (your Zoom, Teams or Meet address).
3. **Registration** — see below.
4. **Programme** — the **Agenda** (a time, what happens, and a line about it)
   and the **Speakers** (a name, a role, and a photo from the media library).
   Both are optional; leave them empty and the page shows neither.
5. **Media** — the cover picture. It is cropped to fit, so keep the subject
   near the middle.
6. **FAQs** — questions and answers shown on the event's page.
7. **SEO** — as on every other page.

Set the status to **Published** and save. The event's page is live at once,
and a link to **Events** can be added to your menus (chapter 05).

> **The join link is never shown on your website.** It is sent only to people
> who register, in their confirmation email and the calendar file attached to
> it. An online event that takes registrations cannot be published without
> one.

## Registration

On the **Registration** tab, **Where people register** has three choices:

| Choice | What happens |
|---|---|
| **No registration** | The page announces the event and nobody signs up |
| **Register on this site** | A form on the page: name, email, and optionally phone, company, seats and a note |
| **Register somewhere else** | A button to the organiser's own sign-up page — enter its address |

For registration on your site you can also set:

- **Capacity** — the number of seats. Blank means no limit. The website
  never shows how many are left; when few remain it says "Few places left".
- **Keep a waiting list once it is full** — people who register after the
  last seat are told they are waiting. When somebody cancels, the longest-
  waiting person whose party fits is confirmed and emailed automatically.
  With this off, a full event simply says it is full.
- **Seats per registration** — the most one person may book at once.
- **Registration closes** — an optional time after which the form is
  replaced by "Registration has closed". Blank keeps it open until the event
  starts.

## What a visitor receives

- A **confirmation email** with the date and place, a calendar file, the join
  link for an online event, and a link to a page showing their registration.
- From that page they can **cancel**. Their seats go to the waiting list.
- A **reminder** before the event starts — 24 hours by default.
- If they register twice with the same address, nothing changes and the
  confirmation is simply sent again. To change the number of seats they cancel
  and register again, or you can edit it for them.

You receive a notice of every registration (see *Settings* below), and each
one is also filed as a **lead** (chapter 10).

All of these emails can be reworded under **System → Settings → Email
templates**.

## Registrations

Open **Registrations** from an event's row or its form. The screen shows the
confirmed seats against the capacity, how many are waiting, and a list of
everybody who registered.

- **Status** — change it from the row. *Cancelled* emails the person and
  gives their seats to the waiting list. *Attended* and *No-show* can be set
  once the event has started.
- **Confirming somebody when the event is full** is refused, with a **Confirm
  anyway** link if you want to go over the capacity.
- **Edit** changes the number of seats and adds a note only your team sees.
- **Add a registration** registers somebody by hand — a customer who rang,
  for instance. Tick **Go past the limit** to add them to a full or closed
  event, and untick **Email them the confirmation** if you have already told
  them.
- **Export CSV** downloads the list as a spreadsheet.
- **Delete** removes a registration for good, without emailing anybody.

A sales manager can open an event's registrations (from the notification
email, or from a lead) but not the events themselves.

## Changing an event after people have registered

Edit and save as usual. If you have changed the time, the place or the join
link, tick **Tell everyone registered about a change of time or place** on
the Registration tab before saving: everybody with a confirmed place is
emailed the new details and a new calendar file. Without the tick, nobody is
told.

An event with registrations cannot be deleted — set its status to
**Archived** instead, which takes it off the website and keeps the list.

## Running the same event again

Press **Duplicate** on the event. You get a draft copy with the same
description, programme and registration settings and no registrations. Change
the date and publish it.

## Showing events elsewhere on the site

- Add **Events** to a menu (chapter 05). The link is shown only while at
  least one event is published.
- On a builder page, add a **Cards** section and choose **Upcoming events**
  as its source.

## Settings

**Events → Settings** (administrators):

- **Registrations go to** — where the notice of each registration is sent.
  Blank uses your Sales email.
- **Reminder (hours before the start)** — 24 by default; 0 sends no reminder.
- **Seats per registration** — the default for a new event.

## Things to know

- Times are in your site's timezone and are shown that way to every visitor.
- Reminders and waiting-list emails are sent by the scheduled task set up at
  installation (chapter 02 or 03). If reminders do not arrive, check it is
  still running (chapter 23).
- A sample install comes with three events titled "Sample …". Delete them
  before you launch.
