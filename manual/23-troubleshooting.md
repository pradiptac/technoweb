# 23 — Troubleshooting

Start with **System → System status** in the console. Most problems show up
there in red with a sentence beside them.

## No email arrives (sign-in codes, receipts, ticket replies)

1. **System → Settings → Outgoing mail**: type an address in **Send the test
   to** and press **Send**. If it fails, the message shown is your mail
   provider's own explanation: a wrong password, a blocked port, a sender
   address that is not allowed.
2. If the test arrives but other mail does not: **the scheduler is not
   running.** Mail is queued and sent by the scheduler every minute. Check
   **System → System status → The scheduler**.

## The scheduler is not running

**The quickest way: open System → System status → The scheduler.** It shows
the exact command for your server, already filled in with the right paths,
a **Copy** button, and the steps for adding it in Plesk, in cPanel or from a
terminal. Where your host allows it, the site also tests the command and says
whether it works. After adding it, press **Check again** on that screen:
within two minutes it reads **Running**.

The rest of this section is for when you cannot open the console.

It is one cron job that must run every minute:

```
* * * * * <php> /home/<you>/altis-tech-cms/api/artisan schedule:run >> /dev/null 2>&1
```

`<php>` is the full path to **PHP 8.3's command-line program**. It is not the
same program the website uses, and it differs by host:

| Host | Usually |
|---|---|
| cPanel (EasyApache) | `/opt/cpanel/ea-php83/root/usr/bin/php` |
| cPanel (CloudLinux alt-php) | `/opt/alt/php83/usr/bin/php` |
| Plesk | `/opt/plesk/php/8.3/bin/php` |

If none of these works, ask your host: *"What is the path to PHP 8.3's CLI
binary for cron jobs?"* After saving the cron job, the status screen shows the
scheduler as running within a minute.

## The website shows an error page or "could not load"

- **System → System status → The website.**
  - **Not answering**: the Node.js app is stopped. In the hosting panel's
    Node.js app page, press **Restart**. If it will not start, the panel shows
    its log. Most often the memory limit is too low, or the Node.js version is
    below 20.
  - **Reaches the API** says **No**: the API address or its SSL certificate
    is wrong. Open the API address in a browser: `https://api.example.com/up`
    should show a page saying the application is up.
- A page that was fine and now shows old content is refreshed within ten
  minutes. Saving the record again in the console refreshes it at once.

## Pictures are missing on the website

- Open the picture's address directly (right-click → open image in new tab).
  If the API address answers **404** for `/storage/…`, the storage link is
  missing. The next update recreates it, or ask your supplier.
- If the API address works but the website shows nothing, check that
  `ASSET_ORIGIN` in `altis-tech-cms/config/web.env` is exactly the API address,
  starting `https://`, then restart the Node.js app.

## "The site is being updated" or "being restored" and it does not go away

An update or a restore is paused. Open **System → Updates** (or **System →
Backups**) and carry it on or roll it back. If nobody returns to it, the pause
lifts by itself — 30 minutes after an update's last step, 15 minutes after a
restore's — but it is better to finish it.

## Locked out of the console

- **Sign-in codes are emailed.** If mail is broken, press **Use your password
  instead** on the sign-in screen.
- If password sign-in has been switched off (**System → Settings → Sign-in →
  Passwords still accepted**) and mail is broken, add the line
  `AUTH_PASSWORD_BREAK_GLASS=true` to `altis-tech-cms/config/api.env`, and
  delete `altis-tech-cms/api/bootstrap/cache/config.php` so the API reads the
  file again. Sign in with the password, fix the mail, then remove the line
  and delete that file once more. This opens passwords for staff only, not
  for customers.
- **Forgot the password**: press **Forgot your password?**. It needs working
  mail. Otherwise ask your supplier.

## The AI features stopped working

The signs: the website assistant answers every question with a list of pages
instead of a written answer; an AI SEO button says *The AI service did not
answer* or *No OpenRouter key is configured*; **Suggest alt text** or **Draft
with AI** refuses.

Open **System → Settings → API keys**, choose the model you use under
**Model to test** and press **Test this model**. What it says tells you which
of these it is:

| What you see | What to do |
|---|---|
| *Save an OpenRouter API key first* | No key is saved. This is the state straight after updating to 0.116.0, which removes the old OpenAI key — see chapter 18, "After updating to 0.116.0" |
| A refusal about the key or sign-in | The OpenRouter key is wrong or was deleted at openrouter.ai. Create a new one and save it here. An OpenAI or Google key pasted here does not work — those go into your OpenRouter account |
| A refusal naming Google or OpenAI, or a missing key | That company's key has not been added in your OpenRouter account (Settings → Integrations), or it is wrong there. Or choose a model from the company whose key you do have |
| A refusal about a limit, a quota or "too many requests" | A free key's allowance is used up for now. It recovers by itself — within a minute for the per-minute limit, the next day for the daily one. If it happens often, use a paid key |
| *The model answered*, but the assistant still lists pages | The model chosen in **Assistant → Settings** is not the one you tested — test that one. Or a free key's limit was reached for a moment while visitors were asking; it recovers by itself |

## Google or Microsoft "redirect URI mismatch"

When you connect Gmail, Google Drive or Microsoft 365, the OAuth client you
created must list **your** website's callback address exactly — your website,
not the API. Each connection has its own:

| Connecting | Callback address |
|---|---|
| Outgoing mail (Gmail) | `https://www.example.com/admin/settings/mail/callback` |
| Email to ticket | `https://www.example.com/admin/settings/tickets/callback` |
| Subscribers from a mailbox | `https://www.example.com/admin/newsletter/subscribers/import/mailbox/callback` |
| Backups to Google Drive | `https://www.example.com/admin/backups/drive/callback` |

The Email to ticket and Backup settings screens also show theirs beside the
Connect button. Add the address in the Google Cloud or Microsoft Entra
console, save, and connect again.

## After changing a setting in `config/api.env` by hand

The API keeps a cached copy of its settings. Your change takes effect after
the next update. To apply it now, delete
`altis-tech-cms/api/bootstrap/cache/config.php` in File Manager (the API reads
`config/api.env` again on its next request, and the next update makes a new
cached copy), or apply the current version's zip again with **Reinstall** on
System → Updates.

## Moving the site to another address

Changing the domain means changing it in three places that must agree:
`FRONTEND_URL` in `config/api.env`, and `SITE_URL` and `CANONICAL_HOST` in
`config/web.env`. Ask your supplier to do it. A mismatch makes search engines
see two copies of every page.

## What to send your supplier

- A screenshot of **System → System status**.
- For a failed update, the text under **What happened so far** on System →
  Updates.
- The time it happened, and what you pressed.
