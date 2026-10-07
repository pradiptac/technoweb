# 04 — First steps after installing

Do these in order before you tell anybody the address. Each one is a few
minutes in the console (`https://www.example.com/admin`).

If the address is already public, switch on **Site → Settings → Coming
soon** first: visitors see a holding page while you work, and you still see
the real site while signed in (chapter 15).

## 1. Test the mail

**System → Settings → Outgoing mail**. If you did not set mail up during the
installation, choose how the site sends email under **Send mail through**,
fill it in and save. Then type an address *outside* your own domain (a Gmail
address is ideal) in **Send the test to** and press **Send**. The test uses
what is saved, not what is on screen, so save first. Until a test arrives,
sign-in codes, receipts and ticket replies are not being delivered.

## 2. Your company's details

**System → Settings**:

- **General**: company name (already set), tagline, logo and favicon.
- **Contact**: support and sales email addresses (both start as the
  administrator's address), phone number, postal address, and the map.
- **Social profiles**: your profiles. Leave any you do not have blank, and its
  icon disappears.
- **Reference numbers**: the letters in front of ticket, engineer visit and
  order numbers — the part people read out on the telephone. Ticket and visit
  numbers start with your company's initials (*Acme Networks* gives
  `AN-2026-00042` and `ANV-2026-00007`), orders with `ORD`. Two to six letters
  or digits, starting with a letter. A change applies to new numbers only;
  existing ones keep theirs, and replies quoting an old ticket number still
  reach that ticket.

Then **Site → Settings → Homepage**: the hero's words and the four figures
under it. **Do not leave invented figures there**: they are claims about your
business.

## 3. How it looks

- **Site → Themes**: pick the layout that suits you. **Preview in a new tab**
  shows the whole site in it before you switch.
- **Site → Settings → Colour palette**: choose a ready palette or enter your
  brand colours. Every palette is checked so that text stays readable in both
  light and dark.
- **System → Settings → Sign-in screen**: the picture or animation beside the
  sign-in form.

See [15 — Appearance](15-appearance.md).

## 4. The legal pages

**Content → Pages**: open **Privacy policy**, **Terms of use**, **Returns
and refunds** and **Shipping and delivery**. They contain placeholder text that reads like a real policy and
is not one. Replace it with text your adviser has approved before launch.

## 5. What you sell and what you do

- **Catalogue**: the solutions, services, industries and product categories
  were created as a starting point. Rename, rewrite or delete them to match
  your business. The site's menu is built from them.
- **Store** (only if you will sell online): add products, then set up payment
  under **Store → Settings → Payments**.

## 6. If you loaded the sample content

The sample posts, products, team members, clients, certifications, case
studies, the sample support tickets, the invented address and the social links
are **all made up**. Delete each of them, or replace it with your own, before
launch. The sample portal customer can be suspended under **Customers**.

## 7. Staff

**System → Staff**: add your colleagues with only the roles they need. See
[17 — Users and roles](17-users-and-roles.md). Everybody signs in with a code
sent to their own email.

## 8. Backups

**System → Backup settings**: set **Scheduled backups** to On, and switch on
at least one destination away from this server (Amazon S3 or compatible,
Google Drive, or SFTP/FTP). Then press **Full backup** under **Back up now** on
**System → Backups** and check it reaches **Complete**. See
[22 — Backups and restore](22-backups-and-restore.md).

**Keep a copy of `altis-tech-cms/config/api.env` somewhere safe** (a password
manager). The `APP_KEY` line in it is needed to read a backup's encrypted
settings.

## 9. Check the status

**System → System status** should show the website running the same version
as the API, the database up to date, and the scheduler running. Anything in
red there has a sentence beside it saying what to do.
