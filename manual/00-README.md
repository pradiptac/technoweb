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
