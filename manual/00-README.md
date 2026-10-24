# Administrator's manual

This manual is for the person who installs and runs **ALTIS TECH-CMS**: the
public site, the customer portal, the shop and the console your staff work in.
The public site, the portal and every email carry your own company's name.
It assumes you can use a hosting control panel (cPanel or Plesk) and its File
Manager. It does not assume you are a developer.

## What is in the zip

```
altis-tech-cms-<version>/
  api/        the part that stores and serves everything (PHP)
  web/        the website and the console (Node.js)
  config/     your settings — empty until you run the setup
  storage/    uploaded files, logs and backups — empty until you use it
  updates/    where a future update is dropped
  MANUAL/     this manual
```

`api/` and `web/` are the program. They are replaced whole every time you
update. `config/` and `storage/` are yours: an update never touches them.

## Where to start

| If you are… | Read |
|---|---|
| Checking whether your hosting can run it | [01 — Requirements](01-requirements.md) |
| Installing on Plesk | [02 — Installing on Plesk](02-install-plesk.md) |
| Installing on cPanel | [03 — Installing on cPanel](03-install-cpanel.md) |
| Just installed it | [04 — First steps](04-first-steps.md) |
| Looking after it day to day | chapters 05–20 and 24, one per area of the console |
| Applying an update | [21 — Updating](21-updating.md) |
| Protecting your data | [22 — Backups and restore](22-backups-and-restore.md) |
| Stuck | [23 — Troubleshooting](23-troubleshooting.md) |
| Running seminars and webinars | [24 — Events](24-events.md) |
| Making the site faster with a CDN | [25 — Using a CDN](25-using-a-cdn.md) |
| Offering datasheets, drivers and firmware | [26 — Downloads](26-downloads.md) |
| Bringing in a site that is not WordPress | [27 — Importing a website](27-importing-a-website.md) |
| Showing your service centres on a map | [28 — The support network](28-support-network.md) |
| Posting the work you invite bids on | [29 — Tenders](29-tenders.md) |
| Asking the console a question | [30 — Ask ALTIS](30-ask-altis.md) |
| Finding broken links and other things to fix | [31 — Site health](31-site-health.md) |
| Letting search find pages by what they mean | [32 — Search by meaning](32-semantic-search.md) |
| Getting help writing pages, replies and emails | [33 — Writing help](33-ai-writing.md) |
| Making a picture from a description | [34 — Pictures made with AI](34-ai-images.md) |
| Choosing your digest and alerts | [35 — Your digest and alerts](35-digest-and-alerts.md) |
| The bell, mentioning colleagues, team notes and editing together | [37 — Notifications, mentions and working together](37-notifications.md) |
| Seeing who visits the site, with no cookies | [38 — Analytics](38-analytics.md) |
| Letting another system read your leads and orders | [39 — API keys](39-api-keys.md) |
| Announcing what you publish on LinkedIn and X | [40 — LinkedIn and X posts](40-social-posts.md) |

## The two addresses

The software answers on **two addresses**, and you choose both during setup:

- **the website**, for example `https://www.example.com`, which is what your
  visitors, your customers and your staff use (the console is at
  `https://www.example.com/admin`);
- **the API**, for example `https://api.example.com`, which the website talks
  to. Nobody visits it directly, except once, to run the setup.

Both need SSL (https). Both hosting panels issue free certificates.

## Getting help

When you contact your supplier, open **System → System status** in the
console first. The version number and anything marked in red there answer
most of the first questions.
