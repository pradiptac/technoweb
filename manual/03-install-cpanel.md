# 03 — Installing on cPanel

About half an hour. You need: the release zip, your two addresses (for example
`www.example.com` and `api.example.com`), and a cPanel login on a plan with
**Setup Node.js App** (see [01 — Requirements](01-requirements.md)).

## 1. The two addresses

1. The website address is usually your account's main domain. If it is not,
   add it under **Domains → Create A New Domain**.
2. **Domains → Create A New Domain** for `api.example.com`. Untick "Share
   document root". The document root is set in step 3.
3. **SSL/TLS Status → Run AutoSSL** so both addresses have a certificate.

## 2. Upload and unpack the zip

1. **File Manager** → your home folder (`/home/<you>`, *not* `public_html`).
2. **Upload** `altis-tech-cms-<version>.zip`, then right-click it → **Extract**.
3. Rename the folder it made to `altis-tech-cms`.

## 3. Point the API at its folder

**Domains** → the API domain → **Manage** → set the **Document Root** to
`altis-tech-cms/api/public` and save.

Then **Select PHP Version** (or **MultiPHP Manager**) for the API domain:
choose **8.3** or newer. Under **Extensions**, tick `intl`, `zip`, `sodium`,
`gd`, `fileinfo`, `pdo_mysql` and `opcache` if they are not ticked already.

## 4. Create the database

**MySQL Databases**: create a database, create a user with a strong password,
and **add the user to the database with ALL PRIVILEGES**. cPanel puts your
account name in front of both, for example `you_site` and `you_siteuser`.
Use the full names in the setup.

## 5. Run the setup

1. Open `https://api.example.com/install/`.
2. For the **setup key**, open `altis-tech-cms/storage/install.key` in File
   Manager and copy the text.
3. Follow the steps: the server check, the database, then your company and
   first administrator (name, mobile number, email and a password of at least
   12 characters). The installer then creates the tables. The company name
   also gives your ticket numbers their letters (*Acme Networks* →
   `AN-2026-00001`); see **System → Settings → Reference numbers** to change
   them.

## 6. Start the website

When the wizard reaches **Start the website**:

1. **Software → Setup Node.js App → Create Application**.
2. Set:
   - **Node.js version**: 22 (or 20)
   - **Application mode**: Production
   - **Application root**: `altis-tech-cms/web`
   - **Application URL**: your website address
   - **Application startup file**: `start.js`
3. **Create**. You do not need "Run NPM Install", and you do not need to add
   environment variables: the settings are in `altis-tech-cms/config/web.env`.
4. Back in the wizard, press **Check the website**.

If the website address was showing cPanel's default page before, that page
goes away as soon as the application is created.

## 7. Add the scheduler

**Advanced → Cron Jobs**:

1. **Common Settings: Once Per Minute (`* * * * *`)**.
2. **Command**: everything after the five stars in the line the wizard
   shows, for example
   `/opt/cpanel/ea-php83/root/usr/bin/php /home/you/altis-tech-cms/api/artisan schedule:run >> /dev/null 2>&1`.
3. **Add New Cron Job**. The wizard sees it within a minute.

If you need the line again later, it is on **System → System status** in the
console, under **The scheduler**, with a Copy button.

If the wizard shows plain `php` at the start of the line, ask your host for the
full path to PHP 8.3's command-line program, or see
[23 — Troubleshooting](23-troubleshooting.md).

## 8. Done

Open the console at `https://www.example.com/admin` and sign in with the
administrator email you gave.

Next: [04 — First steps](04-first-steps.md).
