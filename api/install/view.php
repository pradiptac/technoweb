<?php
use Technoware\Install\Wizard;

/** @var Wizard $this */ ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ALTIS TECH-CMS setup</title>
<style>
:root{--ink:#16181d;--muted:#5b616e;--line:#dfe2e8;--page:#f5f6f8;--card:#fff;--brand:#2f5d50;--brand-ink:#fff;--ok:#1d6b3c;--ok-soft:#e5f3ea;--err:#a3261f;--err-soft:#fbe9e7;--warn:#7a4f06;--warn-soft:#fdf3dc;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--ink:#eceef2;--muted:#a3a9b6;--line:#2c313a;--page:#12151a;--card:#1a1e25;--brand:#7cc3ad;--brand-ink:#0d1512;--ok:#7fd6a0;--ok-soft:#14261b;--err:#ff9b91;--err-soft:#2e1614;--warn:#f1c56b;--warn-soft:#2a2112;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:0 0 12px}
.lede{color:var(--muted);margin:0 0 24px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:16px}
ol.steps{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:0 0 20px}ol.steps li{font-size:13px;padding:4px 10px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
ol.steps li.on{border-color:var(--brand);color:var(--ink);font-weight:600}ol.steps li.done{color:var(--ok)}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 4px}input[type=text],input[type=password],input[type=email],input[type=url],input[type=number],select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit}
.hint{font-size:13px;color:var(--muted);margin:4px 0 0}.err{font-size:13px;color:var(--err);margin:4px 0 0}.row{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}@media(max-width:560px){.row{grid-template-columns:1fr}}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:8px;border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink);cursor:pointer;margin-top:20px}button.ghost{background:transparent;color:var(--ink);border-color:var(--line)}button:disabled{opacity:.55;cursor:default}
.checks{list-style:none;padding:0;margin:0}.checks li{padding:8px 0;border-bottom:1px solid var(--line)}.checks li:last-child{border:0}.checks b{display:inline-block;width:22px}
.ok{color:var(--ok)}.bad{color:var(--err)}.maybe{color:var(--warn)}
.note{padding:12px 14px;border-radius:8px;margin:14px 0 0;font-size:14px}.note.err{background:var(--err-soft);color:var(--err)}.note.warn{background:var(--warn-soft);color:var(--warn)}.note.ok{background:var(--ok-soft);color:var(--ok)}
.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:14px}.bar i{display:block;height:100%;background:var(--brand);width:0;transition:width .3s}
pre,code{font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}pre{background:var(--page);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
dl.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:12px 0}dl.kv dt{color:var(--muted)}dl.kv dd{margin:0;font-weight:600;word-break:break-all}
.radio{display:flex;gap:18px;flex-wrap:wrap}.radio label,.check label{font-weight:400;display:flex;gap:8px;align-items:center;margin:8px 0}
[hidden]{display:none!important}
.maker{display:flex;align-items:center;gap:12px;margin:0 0 20px;font-size:13px;color:var(--muted)}
.maker img{display:block;height:56px;width:auto;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:10px}
</style>
</head>
<body>
<main>
  <?php /* The developer's mark, not the customer's: this screen runs before
     anybody has said whose site it is. On a white plate in both schemes,
     because its grey lettering disappears on the dark page. */ ?>
  <p class="maker"><img src="altis_logo.png" width="1104" height="580" alt="Altis Infonet Private Limited"><span>ALTIS TECH-CMS is made by Altis Infonet Private Limited</span></p>
  <h1>Set up ALTIS TECH-CMS</h1>
  <p class="lede">Version <?= htmlspecialchars($this->defaultsVersion(), ENT_QUOTES) ?> · about ten minutes · every step can be repeated if something goes wrong.</p>
  <ol class="steps" id="steps"></ol>

  <section class="card" data-step="unlock">
    <h2>1. Prove this is your server</h2>
    <p>A one-time key was just written to your hosting account. In the hosting panel's <b>File Manager</b>, open
      <code>storage/install.key</code> inside the folder you uploaded, and copy what it says.</p>
    <label for="key">Setup key</label>
    <input type="text" id="key" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX">
    <p class="err" data-err="key"></p>
    <button data-go="unlock">Continue</button>
  </section>

  <section class="card" data-step="requirements" hidden>
    <h2>2. Check the server</h2>
    <ul class="checks" id="checks"></ul>
    <dl class="kv" id="info"></dl>
    <button class="ghost" data-go="requirements">Check again</button>
    <button data-next="database" id="req-next" disabled>Continue</button>
  </section>

  <section class="card" data-step="database" hidden>
    <h2>3. The database</h2>
    <p class="hint">Create an empty MySQL database and a user for it in the hosting panel (cPanel: "MySQL Databases"; Plesk: "Databases"), then enter them here.</p>
    <div class="row">
      <div><label for="db-host">Host</label><input type="text" id="db-host" name="host" value="localhost"><p class="err" data-err="host"></p></div>
      <div><label for="db-port">Port</label><input type="number" id="db-port" name="port" value="3306"></div>
    </div>
    <label for="db-name">Database name</label><input type="text" id="db-name" name="database"><p class="err" data-err="database"></p>
    <div class="row">
      <div><label for="db-user">User</label><input type="text" id="db-user" name="username" autocomplete="off"><p class="err" data-err="username"></p></div>
      <div><label for="db-pass">Password</label><input type="password" id="db-pass" name="password" autocomplete="new-password"></div>
    </div>
    <div class="check" id="db-confirm" hidden><label><input type="checkbox" name="confirm_not_empty"> Use it anyway</label></div>
    <button data-go="database">Test and continue</button>
  </section>

  <section class="card" data-step="site" hidden>
    <h2>4. Your company and your first administrator</h2>
    <label for="company">Company name</label><input type="text" id="company" name="company_name"><p class="hint">Shown on every page, in page titles and in every email.</p><p class="err" data-err="company_name"></p>
    <div class="row">
      <div><label for="site-url">Website address</label><input type="url" id="site-url" name="site_url"><p class="err" data-err="site_url"></p></div>
      <div><label for="api-url">API address (this page)</label><input type="url" id="api-url" name="api_url"><p class="err" data-err="api_url"></p></div>
    </div>
    <p class="hint">Choose <b>www</b> or no www for the website now: the other spelling will redirect to it.</p>
    <div class="row">
      <div><label for="a-name">Administrator's name</label><input type="text" id="a-name" name="admin_name"><p class="err" data-err="admin_name"></p></div>
      <div><label for="a-phone">Mobile number</label><input type="text" id="a-phone" name="admin_phone" inputmode="tel"><p class="err" data-err="admin_phone"></p></div>
    </div>
    <label for="a-email">Administrator's email</label><input type="email" id="a-email" name="admin_email"><p class="hint">You sign in to the console with this address.</p><p class="err" data-err="admin_email"></p>
    <label for="a-pass">Password</label><input type="password" id="a-pass" name="admin_password" autocomplete="new-password"><p class="hint">At least 12 characters. Keep it in a password manager.</p><p class="err" data-err="admin_password"></p>

    <label>Outgoing mail</label>
    <div class="radio">
      <label><input type="radio" name="mail" value="later" checked> Set it up later in Settings</label>
      <label><input type="radio" name="mail" value="smtp"> SMTP now</label>
    </div>
    <div id="smtp" hidden>
      <div class="row">
        <div><label for="m-host">SMTP server</label><input type="text" id="m-host" name="mail_host"><p class="err" data-err="mail_host"></p></div>
        <div><label for="m-port">Port</label><input type="number" id="m-port" name="mail_port" value="587"></div>
      </div>
      <div class="row">
        <div><label for="m-user">User name</label><input type="text" id="m-user" name="mail_username" autocomplete="off"></div>
        <div><label for="m-pass">Password</label><input type="password" id="m-pass" name="mail_password" autocomplete="new-password"></div>
      </div>
      <div class="row">
        <div><label for="m-enc">Encryption</label><select id="m-enc" name="mail_encryption"><option value="tls">TLS (port 587)</option><option value="ssl">SSL (port 465)</option><option value="none">None</option></select></div>
        <div><label for="m-from">Send from</label><input type="email" id="m-from" name="mail_from"><p class="err" data-err="mail_from"></p></div>
      </div>
    </div>
    <div class="check"><label><input type="checkbox" name="demo"> Load sample content (made-up posts, products, team and tickets to try the site with — all of it must be deleted before launch)</label></div>
    <button data-go="site">Continue</button>
  </section>

  <section class="card" data-step="install" hidden>
    <h2>5. Install</h2>
    <p id="install-what">Writing the settings, creating the database tables and your administrator account.</p>
    <div class="bar"><i id="install-bar"></i></div>
    <p class="hint" id="install-detail"></p>
    <button data-go="install" id="install-go">Install</button>
  </section>

  <section class="card" data-step="website" hidden>
    <h2>6. Start the website</h2>
    <p>The website is a Node.js application. Create it in the hosting panel with exactly these values, then press <b>Check the website</b>.</p>
    <dl class="kv" id="node"></dl>
    <p class="hint"><b>cPanel:</b> Software → "Setup Node.js App" → Create Application. <b>Plesk:</b> the website's domain → Node.js → enable, then set the same values.
      See <code>MANUAL/02-install-plesk.md</code> or <code>03-install-cpanel.md</code> for screenshots.</p>
    <div id="web-note"></div>
    <div class="bar" hidden id="warm-bar-wrap"><i id="warm-bar"></i></div>
    <button data-go="website">Check the website</button>
  </section>

  <section class="card" data-step="scheduler" hidden>
    <h2>7. The scheduler</h2>
    <p>Mail, backups and reminders are sent by one scheduled task that runs every minute. Add this line as a <b>cron job</b>
      (cPanel: Advanced → Cron Jobs, "Once per minute"; Plesk: Tools &amp; Settings or the domain's "Scheduled Tasks", "Run a command").</p>
    <pre id="cron"></pre>
    <p class="hint">If your host names its PHP differently, the manual's troubleshooting chapter says how to find the right path.</p>
    <div id="cron-note"></div>
    <button class="ghost" data-go="scheduler">Check again</button>
    <button data-go="finish" id="finish-go" class="ghost">Finish without it for now</button>
  </section>

  <section class="card" data-step="done" hidden>
    <h2>Done</h2>
    <p>Your website is installed. The setup page is now switched off.</p>
    <p><a id="console-link" href="#">Open the console</a> and sign in with the administrator email you gave. Start with <code>MANUAL/04-first-steps.md</code>: logo, contact details, colours and the policy pages.</p>
  </section>
</main>
<script src="app.js"></script>
</body>
</html>
