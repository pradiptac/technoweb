# Test install on Windows with XAMPP and a `.local` domain

Installs the release zip on a Windows PC so it answers at real-looking names —
**`https://www.altis.local`** for the website and **`https://api.altis.local`**
for the API — instead of `127.0.0.1` with port numbers. It is the closest
you can get to a customer's server without buying a domain. (Use any name you
like in place of `altis.local`; keep the `www.` and `api.` in front.)

The simpler port-based setup is `xampp-test-install.md`. Use this one when you
want to see the site under its own domain, test the domain-dependent settings
(canonical address, cookies, CORS), or demonstrate it to somebody.

**Files to carry to the PC:** the release zip and its `.sha256`, and this manual.
About an hour and a half.

---

## 0. How it fits together

```
browser ──https──▶ Apache (XAMPP, port 443)
                     ├─ www.altis.local ──proxy──▶ Node.js website (127.0.0.1:3000)
                     └─ api.altis.local ──────────▶ the API's public folder (PHP)
                   the two names both point to this PC through the Windows hosts file
```

**Why HTTPS, when it is only a test?** The site marks its sign-in cookies
*secure*. Browsers accept that over plain `http://` only for `localhost` and
`127.0.0.1` — **not** for a `.local` name. Over `http://www.altis.local` you
can open the pages but signing in silently fails. So this setup uses a
certificate made for your PC by a free tool called **mkcert**; the browser
trusts it and there are no warnings.

Everything lives in **`C:\altis`**. Three command windows stay open while you
test: **Node** (website), **scheduler**, and one of your own.

---

## 1. Install what is needed

| Software | Version | Notes |
|---|---|---|
| **XAMPP** | one that ships **PHP 8.3 or newer** | Older XAMPP builds ship PHP 8.2, which the wizard refuses. |
| **Node.js** | **22 LTS** (20 also works) | nodejs.org, Windows installer. |
| **A database** | **MySQL 8.0+** or **MariaDB 10.6+** | XAMPP's own MariaDB is often 10.4 — see step 3. |
| **mkcert** | 1.4 or newer | Download `mkcert-v…-windows-amd64.exe` from the mkcert releases page on GitHub and save it as `C:\tools\mkcert.exe`. |

Check in Command Prompt:

```
C:\xampp\php\php.exe -v
node -v
C:\tools\mkcert.exe -version
```

(If XAMPP is not in `C:\xampp`, use its real path everywhere below.)

---

## 2. Switch on the PHP extensions

Edit **`C:\xampp\php\php.ini`**. Remove the leading `;` from each of:

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

and set:

```
memory_limit = 512M
max_execution_time = 120
upload_max_filesize = 64M
post_max_size = 64M
```

Optional (the wizard only warns): `zend_extension=opcache` and `opcache.enable=1`.

You will come back to this file in step 6 for the certificate. Restart Apache
from the XAMPP Control Panel, then check:

```
C:\xampp\php\php.exe -m | findstr /i "curl fileinfo gd intl mbstring openssl pdo_mysql sodium zip"
```

Nine names should come back.

---

## 3. The database

Start MySQL in the XAMPP Control Panel, then:

```
C:\xampp\mysql\bin\mysql.exe -u root -e "SELECT VERSION();"
```

- **`10.6`+ (MariaDB) or `8.x` (MySQL):** use it.
- **`10.4` / `10.5`:** the wizard refuses these. Run a separate MySQL 8: download
  **MySQL Community Server 8.0, ZIP archive**, extract to `C:\mysql8`, then

  ```
  cd /d C:\mysql8\bin
  mysqld --initialize-insecure --basedir=C:\mysql8 --datadir=C:\mysql8\data
  mysqld --basedir=C:\mysql8 --datadir=C:\mysql8\data --port=3307 --console
  ```

  (leave that window open; use `-P 3307` and `C:\mysql8\bin\mysql.exe` below,
  and port **3307** in the wizard).

Create the database (change the password):

```
C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3306 -u root
```

```sql
CREATE DATABASE altis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'altis'@'localhost' IDENTIFIED BY 'ChangeThisPassword1';
CREATE USER 'altis'@'127.0.0.1' IDENTIFIED BY 'ChangeThisPassword1';
GRANT ALL PRIVILEGES ON altis.* TO 'altis'@'localhost';
GRANT ALL PRIVILEGES ON altis.* TO 'altis'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Give the PC its two names

Open **Notepad as administrator** (Start → type Notepad → right-click → *Run as
administrator*), open `C:\Windows\System32\drivers\etc\hosts` (choose *All
files* in the open dialog), add these lines at the bottom and save:

```
127.0.0.1   www.altis.local
127.0.0.1   api.altis.local
```

Check in Command Prompt:

```
ping -n 1 www.altis.local
ping -n 1 api.altis.local
```

Both must answer from `127.0.0.1`. (Do not skip the hosts file: Windows treats
`.local` names as multicast-DNS names and, without an entry, waits several
seconds on every lookup, or fails.)

---

## 5. Make the certificate

In a Command Prompt **run as administrator**:

```
mkdir C:\certs
cd /d C:\certs
C:\tools\mkcert.exe -install
C:\tools\mkcert.exe -cert-file altis.pem -key-file altis-key.pem www.altis.local api.altis.local
C:\tools\mkcert.exe -CAROOT
```

- `-install` makes Windows (and Chrome and Edge) trust certificates from your
  own mkcert authority. Accept the security prompt.
- The second command writes `altis.pem` and `altis-key.pem` for both names.
- The last prints the folder holding `rootCA.pem` — note it (usually
  `C:\Users\<you>\AppData\Local\mkcert`).

**Firefox** ignores the Windows store by default: open `about:config`, set
`security.enterprise_roots.enabled` to `true`, and restart Firefox.

**Let PHP trust it too** (the setup wizard checks the website over https from
PHP). Make a bundle of XAMPP's own trusted authorities plus yours:

```
copy /b C:\xampp\apache\bin\curl-ca-bundle.crt + "C:\Users\<you>\AppData\Local\mkcert\rootCA.pem" C:\certs\ca-bundle.pem
```

(use the real `-CAROOT` folder), then in `C:\xampp\php\php.ini` set — search for
each name, remove any `;`:

```
curl.cainfo = "C:\certs\ca-bundle.pem"
openssl.cafile = "C:\certs\ca-bundle.pem"
```

Restart Apache afterwards (step 7).

---

## 6. Unpack the release

1. Check the download:

   ```
   certutil -hashfile altis-tech-cms-0.98.1-worktree.zip SHA256
   ```

   It must match the `.sha256` file.

2. Unpack (Windows' own `tar` copes with the 14,000 files):

   ```
   tar -xf altis-tech-cms-0.98.1-worktree.zip -C C:\
   ren C:\altis-tech-cms-0.98.1-worktree altis
   ```

3. **Uploads folder.** PHP on Windows cannot make the symbolic link the wizard
   tries to make, so make a junction yourself **before** the wizard (no admin
   rights needed):

   ```
   mklink /J C:\altis\api\public\storage C:\altis\storage\app\public
   ```

4. **Let the image proxy read pictures from this PC.** The website's image
   proxy refuses addresses that resolve to your own PC (a safety rule that is
   right on a server). Without this every picture is missing. Save this as
   **`C:\altis\patch-local-images.ps1`**:

   ```powershell
   param([string]$Web = "C:\altis\web")

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

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File C:\altis\patch-local-images.ps1
   ```

   It must say `1 place(s) changed` twice. Run it again after any update.

5. *Optional — resized pictures.* The zip carries the Linux image library; on
   Windows the site then serves each picture at its original size (works, just
   heavier). For proper resized WebP copies:

   ```
   mkdir C:\altis-sharp
   cd /d C:\altis-sharp
   npm init -y
   npm install sharp@0.35.4
   xcopy /E /I /Y C:\altis-sharp\node_modules\@img\sharp-win32-x64 C:\altis\web\node_modules\@img\sharp-win32-x64
   ```

---

## 7. Set up Apache

1. In **`C:\xampp\apache\conf\httpd.conf`** make sure these lines are present
   and **not** commented out (no `#`):

   ```apache
   LoadModule rewrite_module modules/mod_rewrite.so
   LoadModule headers_module modules/mod_headers.so
   LoadModule ssl_module modules/mod_ssl.so
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   Include conf/extra/httpd-ssl.conf
   ```

   and add this as the **last line**:

   ```apache
   Include conf/extra/altis.conf
   ```

2. Create **`C:\xampp\apache\conf\extra\altis.conf`**:

   ```apache
   # The API — PHP, from the release's public folder.
   <VirtualHost *:443>
       ServerName api.altis.local
       DocumentRoot "C:/altis/api/public"

       SSLEngine on
       SSLCertificateFile    "C:/certs/altis.pem"
       SSLCertificateKeyFile "C:/certs/altis-key.pem"

       <Directory "C:/altis/api/public">
           AllowOverride All
           Require all granted
           Options -Indexes +FollowSymLinks
       </Directory>
   </VirtualHost>

   # The website — Node.js, behind Apache.
   <VirtualHost *:443>
       ServerName www.altis.local

       SSLEngine on
       SSLCertificateFile    "C:/certs/altis.pem"
       SSLCertificateKeyFile "C:/certs/altis-key.pem"

       ProxyPreserveHost On
       RequestHeader set X-Forwarded-Proto "https"
       ProxyPass        / http://127.0.0.1:3000/
       ProxyPassReverse / http://127.0.0.1:3000/
   </VirtualHost>
   ```

3. **Restart Apache** from the Control Panel. If it will not start, something
   else holds port 443 — find it with `netstat -ano | findstr :443` (Skype,
   VMware, IIS and "World Wide Web Publishing Service" are the usual ones) and
   stop it. Click *Logs* → *Apache error log* for the exact message.

4. Open **https://api.altis.local/install/** — the setup wizard should appear
   with a padlock and no warning. (A certificate warning: step 5 or the browser
   restart; a 404: `AllowOverride`/`mod_rewrite`; a 403: `Require all granted`.)
   `https://www.altis.local` will show an Apache error (`503`) until the website
   is started in step 9 — that is expected.

---

## 8. Run the setup wizard

Open **https://api.altis.local/install/**.

1. **Prove this is your server.** Paste the text of `C:\altis\storage\install.key`.
2. **Check the server.** Everything required ticked (OPcache and free space are
   optional). Red extension → step 2, then *Check again*.
3. **The database.** Host `127.0.0.1`, port `3306` (or `3307`), database
   `altis`, user `altis`, the password from step 3.
4. **Your company and your first administrator.** A company name, then check the
   two addresses **exactly**:

   | Field | Value |
   |---|---|
   | Website address | **`https://www.altis.local`** |
   | API address | **`https://api.altis.local`** |

   The wizard fills both in by itself from the address you opened. Then the
   administrator (name, mobile number, any email, a password of 12+
   characters). Leave email on *Set it up later in Settings*. Tick **Load sample
   content** for the demo site (unticked gives a clean install).
5. **Install.** Two to five minutes, longer with sample content.
6. **Start the website** — next step.

---

## 9. Start the website

In a **new Command Prompt** (window 1). The website must trust your certificate
too, and Node reads that setting only when it starts, so set it in this window
first:

```
set NODE_EXTRA_CA_CERTS=C:\Users\<you>\AppData\Local\mkcert\rootCA.pem
cd /d C:\altis\web
node start.js
```

(use the real `mkcert -CAROOT` folder). It prints `Ready`. Leave it open. Allow
Node in the Windows Firewall prompt if it appears (private network is enough).
If you started it earlier than this step, stop it (Ctrl+C) and start it again —
it reads the wizard's settings only at start.

Back in the wizard press **Check the website**. It asks
`https://www.altis.local/api/health` and continues when both ends agree.

---

## 10. Start the scheduler

Step **7. The scheduler**. In a **second new Command Prompt** (window 2):

```
cd /d C:\altis\api
C:\xampp\php\php.exe artisan schedule:work
```

Leave it open and press *Check again* in the wizard; it finishes within a minute.
(*Finish without it for now* also works, but mail, backups and clean-ups then do
not run.)

---

## 11. Sign in and look around

Open **https://www.altis.local/admin**.

**Email is not set up, so the six-digit code is not delivered.** Choose *Use your
password instead* and sign in with the administrator email and password from
step 8. To see codes while testing: **System → Settings → Outgoing mail** →
**Write to the log — do not send** → Save. Emails are then written to
`C:\altis\storage\logs\mail.log`.

If you loaded the sample content, the demo customer signs in at
`https://www.altis.local/portal/login` with `neil@example.in` and
`Portal-Demo-2026`.

Worth a look: the home page in light and dark; **Services** in the header (three
categories with small coloured icons); pictures loading; the console dashboard;
**System → Status** (shows the API and website addresses and that they agree);
**System → Updates** (shows 0.98.1).

---

## 12. Stop and start again

Nothing needs reinstalling. To resume, start in this order: XAMPP **MySQL** and
**Apache** (plus your `mysqld … --port=3307` window if used); window 1 (with the
`set NODE_EXTRA_CA_CERTS=…` line, then `node start.js`); window 2
(`schedule:work`).

To repeat the install from scratch: stop Node and the scheduler, delete
`C:\altis`, drop and recreate the database, and start again from step 6.

---

## Problems

| What you see | Why, and what to do |
|---|---|
| Browser: "Your connection is not private" | `mkcert -install` was not run as administrator, or the browser was open during it — run it again and restart the browser. Firefox: step 5's `about:config` setting. |
| Apache will not start | Port 443 is taken (see step 7). Or a typo in `altis.conf`: the error log names the line. |
| `https://www.altis.local` shows `503` or `502` | The website is not running (window 1), or something else holds port 3000. |
| Wizard, "Check the website": an SSL / certificate error | PHP does not trust the certificate: redo the bundle and the two `php.ini` lines in step 5, restart Apache. |
| Wizard, "Check the website": cannot reach the site | Node was started before the wizard wrote its settings (restart it), the address in step 8 is not exactly `https://www.altis.local`, or the hosts entries are missing. |
| The site loads but has no data, or Node prints `unable to verify the first certificate` / `fetch failed` | `NODE_EXTRA_CA_CERTS` was not set in window 1 before `node start.js`. |
| Every picture is missing, Node prints `"url" parameter is not allowed` | Step 6.4 was skipped. Run it, restart Node. |
| Pictures load but are heavy | Expected without step 6.5. |
| Uploaded and sample pictures are 404 | The `storage` junction (step 6.3) is missing. |
| Signing in bounces you back to the sign-in page | You are on `http://` — always use `https://www.altis.local`. Cookies also belong to one address, so do not mix in `127.0.0.1`. |
| A sign-in code never arrives | Email is on "later": use the password, or the log transport in step 11. |
| Pages are slow for a few seconds each time | The hosts entries are missing (the `.local` multicast-DNS wait, step 4). |
| Wizard stuck at the scheduler step | Window 2 is not running, or was started before the wizard wrote its settings; restart it and press *Check again*. |
| System → Updates refuses this zip | It is a test build (`worktree` in the name). To try updating on this PC only, add `RELEASE_ALLOW_TEST_BUILDS=true` on a new line in `C:\altis\config\api.env`. Never on a customer's server. |

**Updating through the console on this PC.** There is no Passenger here to
restart the website, and Windows will not rename the `web` folder while Node is
running from it (the update stops at *Finishing the API* with "Could not rename
web to web.prev"). So:

1. When the update screen reaches *Finishing the API* — or stops there — press
   Ctrl+C in window 1 to stop Node, then press **Try this step again**. The
   step carries on from where it stopped.
2. When it says *Restarting the website*, start Node again in window 1 (with
   the `NODE_EXTRA_CA_CERTS` line), run step 6.4 again, and repeat the `mklink`
   of step 6.3 (the junction is lost when the `api` folder is replaced). The
   update then finishes by itself.

---

## What has been tested, and what has not

Tested on Windows against this exact zip: unpacking with `tar`, the checksum
command, `node start.js`, the picture behaviour of step 6.4 and 6.5 (refused →
served → resized) and the storage junction.

Written from documented behaviour but **not run**: the mkcert certificate, the
Apache virtual hosts and proxy, the hosts-file names, PHP's trust of the
certificate, the setup wizard's own steps, and the MySQL 8 side-by-side option.
The reason for HTTPS (secure cookies are not accepted over `http://` on a
`.local` name) is browser behaviour, not something the release does wrongly. If
a step does not behave as written, note its number and what the screen said.
