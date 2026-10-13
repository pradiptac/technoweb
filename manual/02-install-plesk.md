# 02 — Installing on Plesk

About half an hour, most of it waiting. You need: the release zip, your two
addresses (for example `www.example.com` and `api.example.com`), and a login
to Plesk.

## 1. Add the two domains

1. **Websites & Domains → Add Domain** for the website address
   (`www.example.com`, or `example.com` if you do not use www).
2. **Add Subdomain** for the API (`api.example.com`), in the **same
   subscription**.
3. Issue an SSL certificate for both: the domain's **SSL/TLS Certificates →
   Install a free basic certificate provided by Let's Encrypt**.

## 2. Upload and unpack the zip

1. **Files** → open your subscription's home folder (the one *above*
   `httpdocs`).
2. Upload `altis-tech-cms-<version>.zip`, select it, and choose **Extract Files**.
3. Rename the folder it made to `altis-tech-cms`. You now have
   `altis-tech-cms/api`, `altis-tech-cms/web`, `altis-tech-cms/config`, and so on.

## 3. Point the API at its folder

1. **api.example.com → Hosting Settings**. Set the **Document root** to
   `altis-tech-cms/api/public` and save.
2. **PHP Settings** for the same domain: choose **PHP 8.3** (or newer) and
   make sure **opcache** is on.

## 4. Create the database

**Databases → Add Database**: give it a name, and create a database user with
a strong password. Keep the name, user and password to hand.

## 5. Run the setup

1. Open `https://api.example.com/install/` in your browser.
2. It asks for a **setup key**. In **Files**, open `altis-tech-cms/storage/install.key`
   and copy the text inside. This proves you control the hosting account.
3. Follow the steps. The server check and the database come first, then your
   company name, the two addresses, and your first administrator (name,
   mobile number, email and a password of at least 12 characters). Then the
   installer writes your settings and creates the database tables, which
   takes a minute or two.

   The company name also sets the letters in front of your ticket numbers:
   *Acme Networks* gives `AN-2026-00001`, and engineer visits `ANV-2026-00001`.
   You can change them later under **System → Settings → Reference numbers**.

## 6. Your logo (optional)

After the install finishes, the wizard offers to take your logo. Upload a
PNG, JPG, WebP or SVG under 2 MB — a version on a transparent background
works best — and it is saved to your media library and set as the site's
logo.

If the logo has colour in it, the wizard then offers up to three palettes
made from it: the colour there is most of, the boldest, and the darkest.
Press one to use it. A black, white or grey logo has no colour to take, and
it says so.

Both are optional. **Skip this** goes straight on, and you can upload the
logo and choose colours later in the console — chapter 15.

## 7. Start the website (the Node.js app)

When the wizard reaches **Start the website**, go back to Plesk:

1. **www.example.com → Node.js** (install the Node.js extension from
   **Extensions** if the menu is missing) → **Enable Node.js**.
2. Set:
   - **Node.js version**: 22 (or 20)
   - **Document root**: `altis-tech-cms/web/public`
   - **Application root**: `altis-tech-cms/web`
   - **Application startup file**: `start.js`
   - **Application mode**: production
3. Save, then press **Restart App**.
4. Back in the wizard, press **Check the website**. When it says the site is
   running, it refreshes the pages by itself.

You do **not** need to press "NPM install" or add environment variables
there. The website reads its settings from `altis-tech-cms/config/web.env`,
which the wizard wrote.

## 8. Add the scheduler

The wizard shows one line starting `* * * * *`. In Plesk:

1. **Tools & Settings → Scheduled Tasks** (or your subscription's
   **Scheduled Tasks**) → **Add Task**.
2. Task type **Run a command**. Paste everything *after* the five stars as the
   command, and choose **Every minute** (or cron style `* * * * *`).
3. Save. Within a minute the wizard sees it and finishes.

If you need the line again later, it is on **System → System status** in the
console, under **The scheduler**, with a Copy button.

## 9. Done

The wizard shows a link to the console, `https://www.example.com/admin`. Sign
in with the administrator email you gave; a six-digit code is emailed to it,
or use your password. The setup page switches itself off.

Next: [04 — First steps](04-first-steps.md).
