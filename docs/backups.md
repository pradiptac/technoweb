# Backups

System → Backups (2026-09-27). The database and the uploaded files, full and
incremental, to S3 or anything S3-compatible, Google Drive, and SFTP / FTPS /
FTP — any of them at once — and restores, from the console or a terminal.

The code is `api/app/Support/Backups/`, the worker `technoware:backups-work`,
the screens `web/src/app/admin/(app)/backups/` and the settings screen
`/admin/backups/settings` (four groups: `backups`, `backups_s3`,
`backups_gdrive`, `backups_ftp`, all private).

## What a backup is

A folder on each destination, `technoware-backups/<YYYYmmdd-HHMMSS>-<full|incr>-<uuid8>/`:

| File | |
|---|---|
| `database.sql.gz` | The whole database, every time — "incremental" is about the files only |
| `files-001.zip` … | The files, in volumes of at most 128 MB / 4,000 files |
| `index.json.gz` | Every file's size and modification time at this moment |
| `manifest.json` | What the folder holds, each file's sha256, the chain by folder name, the newest migration the database had |

**The manifest is uploaded last**, on every destination. A folder without one
is an upload that never finished, and nothing treats it as a backup.

**Full and incremental.** A full holds every file. An incremental holds the
files whose size or modification time differs from the *previous* backup's
index (so each incremental builds on the one before it, not only on the full)
and lists the paths that went. Restoring backup N applies the full, then each
incremental up to N. Hashing every file to find the three that changed would
read the whole media library every run; an edit through the media library
always moves the size or the time.

**What is in it** (Settings, all three on by default): the database,
`storage/app/public`, `storage/app/private`. Never: `private/backups` (the
staging area), `private/restore`, the three import scratch folders, `.gitignore`
placeholders — and **never `.env`**. The screen says it: without `APP_KEY`,
encrypted settings and sensitive ticket messages cannot be read after a
restore, so the key is kept somewhere else, by a person.

**Tables a dump leaves out and a restore leaves alone** (`backups.preserve_tables`):
`jobs`, `failed_jobs`, `job_batches`, `cache`, `cache_locks`, `backups`,
`backup_uploads`, `backup_restores`. A restore must not delete the row
describing itself, and the queue is in the database. **No foreign key leaves
the three backup tables** for the same reason: `users` is dropped and rebuilt
under them, so `created_by` is a plain number with the name copied beside it.

## The worker runs on the scheduler, not the queue

`technoware:backups-work` every minute, `runInBackground`,
`withoutOverlapping`, forty seconds of work (`backups.budget_seconds`), and a
cache lock so a terminal's `--wait` and the scheduler never both work. It moves
a restore first, then a backup, then starts one the schedule wants.

The queue was the house pattern (`RunWordPressImport`) and is the wrong one
here: **while a restore replaces the database, nothing else may write to it**,
and the queue worker is exactly what would — a campaign batch, a reminder, a
webhook. So `routes/console.php` ends by giving every scheduled event except
`backups-work` and `scheduler-heartbeat` a `skip(RestoreMode::active())`, and
the queue is simply not drained until the restore is done. A restore that
needed the queue could not do that. `BackupTest` checks every event.

**Every step makes progress, however little time is left.** Each loop — the
PHP dumper's batches, the archiver's volumes, the uploader's chunks, the
importer's statements, the restore's downloads and extractions — does one unit
before it looks at the clock. Checking first meant a run that began with the
budget nearly spent did nothing, and the next did the same.

## The dump

`mysqldump --single-transaction --quick --skip-lock-tables --skip-add-locks
--no-tablespaces --hex-blob`, the password in a `--defaults-extra-file` (0600,
deleted in `finally`) and never on a command line. `--column-statistics=0`
only for a MySQL 8 client (MariaDB's refuses the flag). Found at
`BACKUP_MYSQLDUMP_PATH` (a folder or the binary), else on PATH.

**The PHP dumper** (`PhpDumper`) where there is no binary or no `proc_open`,
or where `information_schema` estimates the database above 150 MB — it can
pause, `mysqldump` cannot. `DROP TABLE` + the server's own `SHOW CREATE TABLE`,
then `INSERT`s of 500 rows read by primary-key range, binary columns as hex,
timestamps in UTC. Columns and keys are read once for the whole dump (two
queries), not per batch — per batch it was three `information_schema` queries a
table a run. **It is not one snapshot** when it spans several runs; each run is
its own consistent snapshot. Inside a caller's transaction (a test's) it does
not `START TRANSACTION`, which would commit the caller's.

## Destinations

`Destinations\Destination` is chunk-shaped: `begin` returns resume state,
`send(state, path, offset, length)`, `finish`, ranged `read`, `size`,
`folders`, `deleteFolder`, `probe`. The state lives on the `backup_uploads` row,
so a 128 MB volume goes up over as many runs as it takes. A file that fails is
restarted from its first byte on the next run; after three attempts it and the
rest of that destination's files are marked failed, the destination's
`backup_<key>_error` row says why, and **other destinations carry on**. The
backup ends `completed_with_errors`; its manifest never reached the failed one.

| | Library | Chunks | Resume state |
|---|---|---|---|
| S3 / S3-compatible | `async-aws/s3` (2 MB, on the `symfony/http-client` already here) — not `aws/aws-sdk-php` | 16 MB multipart parts; one `PutObject` under that | upload id, part numbers and ETags |
| Google Drive | `Http`, no Google library | 8 MB, a multiple of 256 KB | the resumable session URI |
| FTP / FTPS | ext-ftp | 8 MB: `STOR` then `APPE` | none needed |
| SFTP | `phpseclib/phpseclib` 3 (pure PHP) | 8 MB `put` at an offset | none needed |

**S3-compatible** needs an endpoint (blank = Amazon) and, for MinIO and some
self-hosted servers, path-style addressing. `sendChunkedBody` is off because
several providers refuse AWS's chunked signing; async-aws reads both booleans
as the *strings* `'true'`/`'false'`.

**Drive is an OAuth consent, not a service account**: a service account has no
storage of its own on a personal Drive. Its own slot,
`OAuthConnection::backupDrive()`, scope `drive.file` (only files this app
made), own client id and secret, callback `/admin/backups/drive/callback`
(`CallbackPath::assert`). One folder, `technoware-backups`, made at the top of
the Drive, its id in `backup_gdrive_folder_id`; a backup folder inside it per
backup. `OAuthConnection` gained a `noun`, so a Drive refusal does not talk
about a mailbox.

**Hosts are checked and connections pinned.** An FTP/SFTP host goes through
`PublicHost` on save and again at connect time, and the extension is handed the
checked IP rather than the name. FTP passive mode ignores the address in the
server's `PASV` reply (`FTP_USEPASVADDRESS` off), which could otherwise point
the data connection anywhere on the LAN. A custom S3 endpoint is resolved,
checked and pinned with Symfony's `resolve`. `BACKUP_ALLOW_PRIVATE_HOSTS=true`
in the API's `.env` opens private addresses, for a NAS in the office — an
operator's decision, deliberately not the console's.

**SFTP pins the host key on first contact** (`backup_ftp_sftp_fingerprint`,
`host:port SHA256:…`, the form `ssh-keygen -lf` prints) and refuses a different
key afterwards, quoting both. Changing the host re-pins; "Forget the pinned
key" on the FTP tab is for a server that was rebuilt. **FTPS does not verify
the certificate** — PHP's extension cannot — which the protocol's description
says.

**A stored secret goes only where it was saved for**: a new FTP host or S3
endpoint needs the password or key typed again in the same save (the
`smtp_host` rule).

## Schedule and retention

Slots: the backup time on the full day (or daily), and with incrementals on,
every 24, 12 or 6 hours from the backup time. A slot is due once it has passed
and no scheduled backup has started since; only the latest slot counts, so a
server that was off for two days takes one backup when it returns.

An incremental slot asks for `auto`, which is a full when there is nothing
sound to build on: no finished backup, its index gone from this server, a chain
already holding `backup_max_chain` incrementals, a destination switched on
since that does not hold the chain, or a restore since the parent (restored
files' dates match no index).

After each backup (`Retention`): the newest `backup_keep_chains` fulls are kept
with their incrementals and older chains are deleted **whole**, from every
destination and from here; the newest `backup_keep_local` also stay on this
server (the rest keep only their index, a few hundred KB); a backup that
reached no destination keeps its copy whatever the setting; failed and
cancelled rows go after two days, safety copies after fourteen. Deleting from a
destination is best effort, and it goes to the destination **as configured
now**: point the FTP slot at another server (or S3 at another bucket) and the
old one's backups stay where they are — found on 2026-09-27, when a backup
sent over FTPS outlived its chain because the slot had since become SFTP. S3 multipart uploads abandoned by a failure are not
aborted — give the bucket a lifecycle rule that cleans incomplete uploads.

A failure writes `backup_error` (the banner) and emails `backups_email`, else
the support address (`backup_failed` in the email templates).
`technoware:prune-backups` hourly fails a backup or restore untouched for 30
minutes and clears a restore flag nothing is using.

## Restore

`RestoreRunner::plan()` resolves the chain and checks it before anything is
touched: complete somewhere, the right kind of backup for the scope, a schema
no newer than this code's (the manifest's newest migration against this
code's). Then, a step at a time:

1. **safety** — before a database is replaced, the current one is dumped to
   this server (`pre_restore`), so restoring the wrong backup is undoable the
   same way. `BackupRestoreTest` does exactly that.
2. **downloading** — only what is needed: the chosen backup's dump, and every
   volume of its chain for files. Ranged reads, and each file checked against
   its sha256 before anything is replaced.
3. **importing** — restore mode on; every table but the preserved ones dropped;
   the dump run back through `SqlImporter`.
4. **files** — each volume of the chain extracted over the live tree, the full
   first, so a later copy wins. With "also delete files that were not in the
   backup", anything not in the chosen backup's index is removed.
5. **finishing** — `migrate --force` when the backup's schema is older, the
   settings cache dropped, restore mode off.

**`SqlImporter` resumes by byte offset at statement boundaries**, reading the
SQL rather than splitting on `;` (quotes with backslash and doubled escapes,
backticks, `--`/`#`/block comments, `DELIMITER`). Each run is a new connection,
so every step sets the session itself and skips what breaks when a run ends
between two statements: `mysqldump`'s `@OLD_*` and `@saved_cs_client`
save/restore pairs (null in the next connection, and MySQL refuses the
assignment), `SQL_LOG_BIN` and `GTID_PURGED` (a shared host grants neither),
`CREATE DATABASE`/`USE`, and **`LOCK TABLES`** — found by the round-trip test:
a pause between a lock and its unlock left the connection holding the table,
the next query failed with 1100, and every `migrate` after it waited for ever
on the metadata lock.

**Archive entries are data from somewhere else**, so
`BackupPaths::restoreTarget()` writes only `public/…` and `private/…`, refuses
`..`, absolute paths, drive letters, NUL and the excluded folders. The control
run that removed the check wrote `escaped.php` outside the tree.

**Restore mode** is a cache flag (the settings table is being replaced), fifteen
minutes and renewed each step, so a dead worker cannot hold the site closed.
While it is on, `EnsureNotRestoring` answers 503 on every API route except
`admin/backups*` and `admin/auth/*`, and the scheduler skips everything but the
worker. Signing in works again once `users` is back. A restore that fails
part-way through the import says the database may be incomplete and names the
safety copy.

**From the console**: `role:admin`, the word RESTORE typed, recorded in the
activity log. `personal_access_tokens` comes back as it was, so the person
restoring is usually signed out; the screen notices it lost the session and
says to sign in again. On completion the console drops the whole Next cache
(`revalidatePath("/", "layout")`), because every cached public page was
rendered from the database that was replaced.

**From a terminal** — the fresh-server door, where the database that
remembered the backups is the thing that is gone:

```bash
php artisan migrate --seed                             # an empty install
# save the destination under Backup settings (or tinker the rows)
php artisan technoware:backup-restore s3 --list        # the folders it holds
php artisan technoware:backup-restore s3 20260927-021500-full-3f9c1a2b --scope=both
php artisan technoware:backup --type=full --wait       # a backup, worked through here
```

## Verified

- `BackupTest` (21), `BackupRestoreTest` (3, the round trip with the PHP dumper
  and with `mysqldump`, undone by restoring the safety copy; a failure
  mid-import), `BackupDestinationsTest` (5), `BackupSqlTest` (29). Control-run:
  removing the zip-slip check fails exactly the climbing cases; letting the dump
  include preserved tables fails exactly the dump test.
- Against real servers on this machine (2026-09-27): **s3rver** (S3 API,
  path-style, SigV4, a 92 MB multipart upload read back byte-identical);
  **pyftpdlib** plain FTP and **FTPS** with TLS required on data; a
  **paramiko SFTP server** with a password and with an ed25519 key, the pinned
  fingerprint equal to `ssh-keygen -lf`'s, and a swapped host key refused. A
  console restore of the dev database from S3 completed (734 statements, a
  marker setting reverted), and `technoware:backup-restore ftp <folder>` over
  SFTP. moto's S3 server stored empty bodies under Python 3.14 even for plain
  curl, which is why it was not the S3 check.
- **Not driven against Google**: the Drive consent needs a real Google Cloud
  project. The REST calls are pinned by `Http::fake` (resumable session, 308,
  `Content-Range`, the folder), the consent by the same `OAuthConnection`
  round trip the mailboxes use.

## Deploying

`composer install` pulls `async-aws/s3` and `phpseclib/phpseclib`. **ext-ftp**
is needed only for FTP/FTPS — switch it on in `php.ini` (it is not declared in
`composer.json`, so a server without it still boots; the FTP test says what is
missing). Run `migrate` and `db:seed --class=SettingsSeeder`. The scheduler's
cron entry, already required for mail, is what runs backups. The staging area
needs room for one backup (the screen shows free space and "Back up now" refuses
when there is not 1.2× the estimate). Keep `APP_KEY` somewhere other than the
server.
