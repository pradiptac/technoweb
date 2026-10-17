# Site health: what needs fixing

*Who can use this: Content manager, Shop manager, SEO manager and
Administrator. You see the problems on the records you look after;
Administrators see all of them, and the settings.*

**Site health** is a list of the small mistakes that creep into a website as
people edit it: a link to a page that has since gone, a product nobody has
looked at for two years, a picture a blind visitor cannot have described to
them. You find it under **Content → Site health**.

It only tells you. It never changes a page, a link or a picture by itself. Every
line has a **Fix** button that opens the record on the right tab, and when you
save, the line leaves the list within a minute.

## Reading the list

Each line is one problem. It says what is wrong in a sentence, which record it
is on, which part of the record, and how long it has been there. The most
serious come first.

Use the filters above the list to narrow it:

- **Group** — Links, Out of date or Accessibility.
- **Severity** — Error, Warning or Notice.
- **Type** — one kind of record, such as Pages or Shop products.
- **To fix / Ignored** — what is waiting, or what you have ignored.

Administrators also see three small boxes at the top with the number in each
group, and the **site health score** (see the end of this chapter).

On a phone each problem is a card instead of a row.

## Links

Every link in a page, a post, a section or a button is looked at.

| What it says | What it means | What to do |
|---|---|---|
| *Links to /old-page, which does not exist.* | The link points to a page on your own site that is gone, or was never there. | **Fix**, then choose the right page, or remove the link. |
| *Links to https://…, which did not answer twice in a row (404).* | A link to another website that did not answer on two tries in a row — the second try comes a day after the first. | Open the link yourself. If the other site has moved, change the link; if it has gone, remove it. |
| *Links to /old, which now redirects to /new.* | The link still works, because you set up a redirect, but it takes a detour. | Link to the new address directly. This is a **Notice**: nothing is broken. |
| *Links to #prices, which is not on this page.* | A link to a spot on the same page that does not exist. | Check that the section it should jump to has that anchor name, or fix the link. |

Links to other websites are checked politely, one at a time and no more than
about once a week. **A link is only listed as broken after it has failed twice**,
so a website that is down for an hour does not fill your list. Some websites —
LinkedIn is the usual one — refuse every checker; a refusal like that is never
counted as a broken link.

Links to your own site are checked at once, with no waiting.

## Out of date

- ***Not edited for 20 months.*** A page, product or article nobody has changed
  for longer than your site allows. Often the answer is to read it and press Save
  — an unchanged page that is still right is fine. How long is "too long" is
  yours to set for each kind of record (see **The settings** below).
- ***This event has taken place and is still featured.*** Untick **Featured** so
  an old event is not shown on the front of your site.
- ***This vacancy is past its closing date and still published.*** Archive it, or
  move the closing date.
- ***This certification has expired and is still published.*** Replace it with the
  renewed certificate, or unpublish it.

Blog posts, case studies, tenders and vacancies are not listed for their age,
because they are dated and nobody expects them to be re-edited.

## Accessibility

These are things a screen reader — software that reads a page aloud — cannot
cope with. They are also what search engines read.

- ***The picture … has no description for screen readers.*** Open the picture in
  **Content → Media** and fill in its **Alt text**: one short sentence saying
  what it shows. Fix it once there and every page using that picture is fixed.
  A picture typed straight into the text of a page has its own description box
  in the editor.
- ***A heading jumps from level 2 to level 4.*** Headings are an outline: a level
  2 is followed by a 3, not a 4. Change the heading to the next level down.
- ***A link says only "click here".*** Say where the link goes — "Download the
  price list" — because a screen reader reads out a list of links with nothing
  around them.
- ***A link has no words.*** A link made of nothing, or of a picture with no
  description. Add words to it or remove it.
- ***A table has no header row.*** Mark the first row of the table as a header row.
- ***A video has no heading or caption.*** Give the video a heading or a caption
  so everybody knows what it is.

## Ignore, and Recheck

**Ignore** is for a problem you have decided to live with — a link to a partner's
site that blocks checkers, a very old page you want to keep exactly as it is.
It leaves the list, and the score stops counting it. **Nothing is deleted**: choose
**Ignored** in the filter to see everything you have ignored and press **Stop
ignoring** to bring one back. You can tick several lines and ignore them in one
go.

If you ignore a link and later change it to a different broken address, the new
problem is listed again. It is a different problem.

**Recheck** looks at that one record again right now, instead of waiting for the
next check. You rarely need it: saving a record rechecks it by itself. It is
useful after you fixed something *elsewhere* — you uploaded a missing file, or
created the page a link was pointing to.

**When does everything get checked?** Saving a record checks that record, within
a minute. Every night at about ten to three, the whole site is checked again;
"Everything was last checked …" at the foot of the list says when.

Drafts are checked too, so you can clean them up before they go live.

## The site health score (Administrators)

The score is the share of your published records that have **nothing to fix** —
no error and no warning. A site with 200 published pages and 10 with problems
scores 95%. Notices do not lower it, ignored problems do not lower it, and
drafts are not counted. It is blank until there is something published.

The small chart beside it is the last three months, and the note under it says
how many points it has moved in 30 days. Treat it as a direction, not a grade:
the list is the thing to work down.

The **Site health** panel can be added to your dashboard from **Customise** on
the dashboard. It is off until you turn it on.

## The settings (Administrators)

**Content → Site health settings:**

- **Check links to other websites** — turn this off if you do not want your site
  to visit other people's websites at all. Links to your own pages are always
  checked.
- **How long before a record is out of date** — a number of months for each kind
  of record. **0 means never.** The numbers shown are sensible starting points:
  eighteen months for pages, solutions, services and products, twelve for
  knowledge articles, landing pages and upcoming events.

**If a great many links to your own pages suddenly show as broken**, suspect the
setup rather than your editors. Your own pages are checked by asking the website
itself, using the internal address set up when the site was installed
(`WEB_INTERNAL_URL`). If that address is wrong, or the website is down, every
link the software cannot settle on its own is reported as broken. Check
**System → Status** to see whether the website is answering, and ask whoever set
up the server if it is not.

If nothing ever appears in the list on a new site, check that the **scheduler**
is running (**System → Status**) — the checks that happen at night and the
checking of other websites' links both depend on it.
