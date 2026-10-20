# Test install on Windows with XAMPP

For trying the release zip on a Windows PC before it goes to a customer.
Everything runs on that one PC and is reached at `127.0.0.1`. About an hour,
most of it downloads and the installer's own waiting.

This is a **test setup**: no domain, no HTTPS, no cPanel or Plesk. It is not how
a customer installs (that is `MANUAL/02-install-plesk.md`), but it goes through
the same setup wizard, so it tests the same code.

**Files to carry to the PC**

- `altis-tech-cms-0.98.1-worktree.zip`, and its `.sha256` file
- this manual

---

## 0. What you will end up with

| Part | Runs as | Address |
|---|---|---|
| The API (Laravel) | Apache from XAMPP, on its own port | `http://127.0.0.1:8000` |
| The website (Next.js) | Node.js, started by hand in a window | `http://127.0.0.1:3000` |
| The database | MySQL 8 (or MariaDB 10.6+) | `127.0.0.1:3306` |
| The scheduler | `php artisan schedule:work`, in a window | (mail, backups, cleanup) |

Three command windows stay open while you test: **Node** (website),
**scheduler**, and one for your own commands. Apache and MySQL run from the
XAMPP Control Panel.

Everything is installed in **`C:\altis`**. Keep that short path: the release
has over 14,000 files and some Windows tools stumble on long paths.

Use **Chrome, Edge or Firefox**. The site's sign-in cookies are marked secure,
which those browsers accept on `127.0.0.1`; Safari does not.

---

## 1. Install what is needed

| Software | Version | Notes |
|---|---|---|
| **XAMPP** | one that ships **PHP 8.3 or newer** | Older XAMPP builds ship PHP 8.2 and the wizard refuses it. Download the 8.3 (or newer) build from apachefriends.org. |
| **Node.js** | **22 LTS** (20 also works) | nodejs.org, the Windows installer. |
| **A database** | **MySQL 8.0+**, or **MariaDB 10.6+** | See step 3. XAMPP's own MariaDB is often 10.4, which the wizard refuses. |

Then open **Command Prompt** and check:

```
C:\xampp\php\php.exe -v
node -v
```

PHP must say 8.3 or higher and Node 20 or higher. (If XAMPP is somewhere other
than `C:\xampp`, use that path in every command below.)

---

## 2. Switch on the PHP extensions

Edit **`C:\xampp\php\php.ini`** (XAMPP Control Panel → Apache → **Config** →
*PHP (php.ini)*). Find each of these lines and remove the `;` at the start if
there is one:

```
extension=curl
extension=fileinfo
extension=gd
extension=intl
extension=mbstring
extension=openssl
extension=pdo_mysql
extension=sodium
extension=zip
```

and set these (search for each name):

```
memory_limit = 512M
max_execution_time = 120
upload_max_filesize = 64M
post_max_size = 64M
```

Optional, but the wizard warns without it: OPcache. Make sure these two lines
are not commented out:

```
zend_extension=opcache
opcache.enable=1
```

**Restart Apache** (Control Panel → Apache → Stop, then Start), then check
from Command Prompt that all of them are loaded:

```
C:\xampp\php\php.exe -m | findstr /i "curl fileinfo gd intl mbstring openssl pdo_mysql sodium zip"
```

Nine names should come back. `dom`, `tokenizer` and `ctype` are built into
PHP on Windows and need nothing. The command-line PHP reads the same
`php.ini`, so this covers the scheduler too.

---

## 3. The database

**Which server?** Start XAMPP's MySQL (Control Panel → MySQL → Start) and ask
it its version:

```
C:\xampp\mysql\bin\mysql.exe -u root -e "SELECT VERSION();"
```

- **`10.6` or higher (MariaDB), or `8.x` (MySQL)** — use it. Go to *Create the
  database* below.
- **`10.4` or `10.5`** — the wizard will refuse it ("MySQL 8.0 or newer is
  needed"). Run a separate MySQL 8 next to XAMPP:

  1. Download **MySQL Community Server 8.0, ZIP archive** from dev.mysql.com
     and extract it to `C:\mysql8`.
  2. In Command Prompt:

     ```
     cd /d C:\mysql8\bin
     mysqld --initialize-insecure --basedir=C:\mysql8 --datadir=C:\mysql8\data
     ```

  3. Start it (leave this window open, or stop XAMPP's MySQL if you would
     rather use port 3306):

     ```
     mysqld --basedir=C:\mysql8 --datadir=C:\mysql8\data --port=3307 --console
     ```

  4. In another window, use `-P 3307` instead of the port shown below, and
     `C:\mysql8\bin\mysql.exe` instead of XAMPP's. In the wizard, the database
     port is then **3307**.

**Create the database** (change the password):

```
C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3306 -u root
```

then, at the `mysql>` prompt:

```sql
CREATE DATABASE altis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'altis'@'localhost' IDENTIFIED BY 'ChangeThisPassword1';
CREATE USER 'altis'@'127.0.0.1' IDENTIFIED BY 'ChangeThisPassword1';
GRANT ALL PRIVILEGES ON altis.* TO 'altis'@'localhost';
GRANT ALL PRIVILEGES ON altis.* TO 'altis'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

Keep the database name (`altis`), user (`altis`) and password for the wizard.

---

## 4. Unpack the release

1. Check the download is intact. In Command Prompt, in the folder holding the
   zip:

   ```
   certutil -hashfile altis-tech-cms-0.98.1-worktree.zip SHA256
   ```

   The long code it prints must match the one inside the `.sha256` file.

2. Unpack it. Windows' own `tar` is fast and copes with 14,000 files (Explorer's
   "Extract All" can take ten minutes; 7-Zip is fine too):

   ```
   tar -xf altis-tech-cms-0.98.1-worktree.zip -C C:\
   ren C:\altis-tech-cms-0.98.1-worktree altis
   ```

   You now have `C:\altis\api`, `C:\altis\web`, `C:\altis\config`,
   `C:\altis\storage`, `C:\altis\updates` and `C:\altis\MANUAL`.

3. **Make the uploads folder reachable.** The wizard tries to link
   `api\public\storage` to the uploads, and PHP on Windows is not allowed to
   make that kind of link, so it silently does not. Without it every uploaded
   or sample picture is a 404. Make it yourself, **before** the wizard, with a
   *junction* (no administrator rights needed):

   ```
   mklink /J C:\altis\api\public\storage C:\altis\storage\app\public
   ```

   It answers `Junction created for …`. The wizard sees the folder is already
   there and leaves it alone.

---

## 5. Prepare the website for a Windows PC

The release's website is built for Linux servers. Two things need adjusting
for a test on Windows, and both are only about **pictures**.

### 5a. Let the image proxy read pictures from `127.0.0.1`

The website serves every picture through its own image proxy, which refuses to
fetch from a private address such as `127.0.0.1` — a safety rule that is right on
a real server and wrong here. Without this step every picture on the site is
missing, with the error `"url" parameter is not allowed` in the Node window.

Save this as **`C:\altis\patch-local-images.ps1`** (Notepad → Save as → *All
files*):

```powershell
param([string]$Web = "C:\altis\web")

# Lets the website's image proxy fetch pictures from a local address.
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($f in @("server.js", ".next\required-server-files.json")) {
    $path = Join-Path $Web $f
    $text = [System.IO.File]::ReadAllText($path)
    $pattern = '"dangerouslyAllowLocalIP":\s*false'
    $count = ([regex]::Matches($text, $pattern)).Count
    $text = [regex]::Replace($text, $pattern, '"dangerouslyAllowLocalIP":true')
    [System.IO.File]::WriteAllText($path, $text, $utf8)
    Write-Host "$f : $count place(s) changed"
}
```

Run it:

```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\altis\patch-local-images.ps1
```

It must say `1 place(s) changed` for both files. (Run it again after any update
that replaces the `web` folder.)

### 5b. Optional: real image resizing

The zip carries the Linux image library. On Windows it cannot load, and the site
quietly serves each picture at its **original size** instead of a resized WebP
copy. That works, but pages are heavier than they would be on a server. To get
the resized copies, add the Windows library (needs internet, once):

```
mkdir C:\altis-sharp
cd /d C:\altis-sharp
npm init -y
npm install sharp@0.35.4
xcopy /E /I /Y C:\altis-sharp\node_modules\@img\sharp-win32-x64 C:\altis\web\node_modules\@img\sharp-win32-x64
```

Skip this if you only want to see that the install works.

---

## 6. Give the API its own Apache port

Apache serves the API's `public` folder on port 8000.

1. Create **`C:\xampp\apache\conf\extra\altis.conf`** with:

   ```apache
   Listen 8000

   <VirtualHost *:8000>
       ServerName 127.0.0.1
       DocumentRoot "C:/altis/api/public"

       <Directory "C:/altis/api/public">
           AllowOverride All
           Require all granted
           Options -Indexes +FollowSymLinks
       </Directory>
   </VirtualHost>
   ```

2. Open **`C:\xampp\apache\conf\httpd.conf`** (Control Panel → Apache →
   **Config** → *Apache (httpd.conf)*) and add this as the last line:

   ```apache
   Include conf/extra/altis.conf
   ```

   Also check that this line is **not** commented out (no `#` in front):

   ```apache
   LoadModule rewrite_module modules/mod_rewrite.so
   ```

3. **Restart Apache.** If it will not start, another program is on port 8000;
   change `8000` in both places above and in the wizard addresses below.

4. Open **http://127.0.0.1:8000/install/** in the browser. You should see the
   setup wizard. (A `404` means Apache is not using the new folder — recheck
   step 2; a `403` means `Require all granted` is missing.)

---

## 7. Run the setup wizard

Open **http://127.0.0.1:8000/install/**.

1. **Prove this is your server.** Open `C:\altis\storage\install.key` in
   Notepad and paste what it says.
2. **Check the server.** Everything required should be ticked. *OPcache*
   and the free-space line are optional. If an extension is red, go back to step 2 (then
   press *Check again*). If PHP is red, XAMPP is older than 8.3.
3. **The database.** Host `127.0.0.1`, port `3306` (or `3307` if you started
   MySQL 8 separately), the database name, user and password from step 3.
4. **Your company and your first administrator.** Fill in a company name
   (anything), then — read carefully:

   | Field | Type this |
   |---|---|
   | Website address | **`http://127.0.0.1:3000`** |
   | API address | **`http://127.0.0.1:8000`** |

   The wizard fills in `https://www.127.0.0.1`, which is wrong here: replace
   it. The two addresses must differ; the different port is enough.

   Then the administrator: name, mobile number, an email address (any),
   and a password of at least 12 characters. Leave the email question on
   *Set it up later in Settings*. Tick **Load sample content** to get the demo site — the posts, products,
   services, team and support desk described in `MANUAL/04-first-steps.md`.
   Leave it unticked for a clean install.
5. **Install.** Press *Install*. The wizard writes the settings and creates
   the tables. **This takes two to five minutes**, longer with sample
   content. Do not close the page.
6. **Start the website** — next step.

---

## 8. Start the website

When the wizard reaches **6. Start the website**, open a **new Command Prompt
window** and run:

```
cd /d C:\altis\web
node start.js
```

It prints `Ready`. Leave the window open. If Windows Firewall asks whether
Node.js may accept connections, **Allow** on a private network (or Cancel — the
site is used only on this PC).

If you started Node earlier than this, stop it (Ctrl+C) and start it again: it
reads the settings the wizard wrote only when it starts.

Back in the wizard press **Check the website**. It calls
`http://127.0.0.1:3000/api/health` and, when the two ends agree, moves on and
refreshes the site's cached pages by itself.

---

## 9. Start the scheduler

Step **7. The scheduler** waits to see the scheduler run. In a **second new
Command Prompt window**:

```
cd /d C:\altis\api
C:\xampp\php\php.exe artisan schedule:work
```

Leave it running, then press *Check again*; within a minute the wizard sees it
and finishes. (A real server uses one cron line for this; `schedule:work` is
the same thing kept open in a window. *Finish without it for now* also works,
but then mail, backups and clean-ups do not run.)

---

## 10. Sign in

The wizard's last page links to the console. Open
**http://127.0.0.1:3000/admin**.

**Email is not set up, so the six-digit code is not delivered.** Use the
password instead: on the sign-in page choose *Use your password instead*, and
enter the administrator email and the password from step 7.

To make codes visible for testing, once you are in:

1. **System → Settings → Outgoing mail** → choose **Write to the log — do not
   send** → Save.
2. From then on, every email the site "sends" is written to
   `C:\altis\storage\logs\mail.log`. Sign out and try a code login: the
   six digits are in that file.

The demo customer, if you loaded sample content, signs in at
**http://127.0.0.1:3000/portal/login** with `neil@example.in` and the
password **`Portal-Demo-2026`**.

---

## 11. What to look at

- **Home page** in light and dark (the sun/moon toggle in the bar at the very
  bottom of the page).
- **Services** in the header: the menu should open to *Web services*,
  *Hardware services* and *Installation services*, each service with its own
  small coloured icon. `/services` shows the same categories as tabs, and
  each service card carries small tag chips.
- **Pictures load** on the home page and `/services` (if not: step 5a).
- **Console** → Dashboard, Site → Menus, System → Status.
- **Book a meeting** at `/book-a-meeting`: it says *We are not taking
  bookings online at the moment* until an administrator switches meetings on
  (that needs a Google calendar, which is not part of this test).
- **System → Updates** shows version 0.98.1.

Things that need outside accounts (Google, payment gateways, email delivery,
WhatsApp) are not expected to work in this test.

---

## 12. Stop and start again

Nothing needs reinstalling. To resume on another day, start these in order:

1. XAMPP Control Panel: **MySQL**, then **Apache** (and your separate
   `mysqld … --port=3307` window, if you used MySQL 8).
2. Window 1: `cd /d C:\altis\web` then `node start.js`
3. Window 2: `cd /d C:\altis\api` then `C:\xampp\php\php.exe artisan schedule:work`

To stop: Ctrl+C in the two windows, then stop Apache and MySQL.

## 13. Start again from nothing

The wizard switches itself off after a successful install. To repeat it, the
clean way is: stop Node and the scheduler, delete `C:\altis`, drop and recreate
the database (`DROP DATABASE altis;` then the `CREATE DATABASE` line from
step 3), and start again from step 4.

---

## Problems

| What you see | Why, and what to do |
|---|---|
| Wizard: "MySQL 8.0 or newer is needed" | The database is older than MySQL 8 / MariaDB 10.6. See step 3. |
| Wizard: PHP 8.3 needed | XAMPP is too old. Install an 8.3+ build of XAMPP. |
| Wizard: an extension is red | Step 2. Restart Apache after editing `php.ini`, then press *Check again*. |
| `/install/` is a 404 or shows Apache's default page | Apache is not using `altis.conf`. Recheck the `Include` line and that `mod_rewrite` is loaded; restart Apache. |
| `500` from the API | Read the last lines of `C:\altis\storage\logs\laravel.log` and `C:\xampp\apache\logs\error.log`. |
| "Check the website" says it cannot reach the site | `node start.js` is not running, was started before the wizard wrote the settings (restart it), or the address typed in step 7 is not exactly `http://127.0.0.1:3000`. |
| Every picture is missing; Node prints `"url" parameter is not allowed` | Step 5a was skipped. Run it, then restart `node start.js`. |
| Pictures load but pages feel heavy | Expected without step 5b. |
| Uploaded pictures and the sample service pictures are 404 | The `storage` junction from step 4 is missing. Create it, then reload. |
| A sign-in code never arrives | Email is on "later". Use the password, or step 10's log transport. |
| The console keeps sending you back to the sign-in page | Use the same address throughout: `http://127.0.0.1:3000`, not `localhost`. Sign-in cookies belong to one address. |
| Wizard stuck at *7. The scheduler* | Window 2 (`schedule:work`) is not running, or was started before the wizard wrote its settings; restart it and press *Check again*. |
| System → Updates refuses this zip | It is a test build (the file name contains `worktree`). To try updating on this PC only, add `RELEASE_ALLOW_TEST_BUILDS=true` on a new line in `C:\altis\config\api.env`. Never on a customer's server. |

After an **update** through the console: there is no Passenger on this PC to
restart the website, so stop `node start.js` and start it again yourself, and
run step 5a again. The `api\public\storage` junction disappears when the `api`
folder is replaced, and PHP cannot remake it here — repeat the `mklink` in
step 4.

---

## What has been tested, and what has not

Tested on Windows against this exact zip: unpacking with `tar`; the checksum
command; the website starting with `node start.js`; the picture behaviour in
5a and 5b (refused → served → resized); and the storage junction.

Read from the code but **not run on XAMPP**: the setup wizard's own steps, the
Apache configuration, the Windows Task Scheduler alternative, and the MySQL 8
side-by-side setup. If a step in this manual does not behave as written, note
the step number and what the screen said — that is what is worth fixing.
