# 01 — Requirements

Check these with your hosting provider **before** you buy or change a plan.
The setup wizard checks them again and says exactly what is missing.

## Hosting

| | Needed |
|---|---|
| Control panel | **Plesk** (Obsidian or newer), or **cPanel** with **"Setup Node.js App"** |
| Account | **One hosting account** holding both addresses (the website and the API). The API must be able to restart the website after an update, which it can only do inside one account. |
| Node.js | 20 or 22, as an "application" the panel runs for you (Passenger) |
| Memory | about **512 MB** for the website's Node.js process, on top of PHP |
| Disk | at least **2 GB free**, plus room for your media library and backups. An update unpacks beside the running copy, so it briefly needs space for two copies. |
| SSL | a certificate for both addresses (Let's Encrypt is fine) |
| Cron | one scheduled task that runs every minute |

**A plain PHP-only shared hosting plan cannot run the website.** Ask your
host: *"Can I run a Node.js 22 application from my cPanel, with about 512 MB
of memory?"* If the answer is no, you need a different plan.

## PHP (for the API address)

- **PHP 8.3** or newer.
- Extensions: `pdo_mysql`, `mbstring`, `openssl`, `curl`, `fileinfo`, `gd`,
  `intl`, `zip`, `sodium`, `dom`, `tokenizer`, `ctype`. Most are on by default.
  In cPanel, switch them on under **Select PHP Version → Extensions**. In
  Plesk, under **PHP Settings** for the domain.
- **OPcache** switched on. It is not required, but without it everything is
  several times slower.
- The PHP function `symlink()` allowed. Hosts almost always allow it.

## Database

- **MySQL 8.0** or newer. MariaDB 10.6 or newer also works; the software is
  tested on MySQL.
- One empty database, and a user with all privileges on it. You create both
  in the panel.

## Email

A mailbox or email service the site can send from: SMTP details from your
host, or an account with Brevo, Mailgun, SendPulse, or Google Workspace. You
can set this up after installing, but nothing (sign-in codes, receipts,
ticket replies) is delivered until you do.

## Before launch, outside accounts you may want

None of these is needed to install. Each is connected later in the console:

- a payment gateway (Razorpay or Cashfree) if you will sell online;
- Google Analytics, Google Search Console and a Google Merchant Center
  account;
- an OpenRouter API key (openrouter.ai), for the AI features: the website
  assistant, and the SEO assistant with its suggested alt text, article
  drafts and page drafts. OpenRouter passes each request to the AI company
  you choose, using your own key for that company, which you add in your
  OpenRouter account — a free Google AI Studio key is enough to start; an
  OpenAI key is needed only for OpenAI's models. See chapter 18;
- a Hunter.io key to check newsletter addresses;
- WhatsApp, RCS or browser-push providers for messaging.
