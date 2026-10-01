# 22 — Backups and restore

*Administrator only.*

A backup copies the **database** (every page, product, order, customer and
ticket) and the **uploaded files** (the media library, ticket attachments,
CVs and invoices). Keep at least one copy **away from this server**. A
backup that sits only on the machine it protects is lost along with that
machine.

## Setting it up

**System → Backup settings** has four tabs.

1. **Schedule**:
   - **Scheduled backups**: On. While it is Off nothing is backed up by
     itself.
   - **Backup time**, **Full backup on** (every day, or one day of the week)
     and **Incremental backups** (Off, daily, every 12 or every 6 hours). An
     incremental copies only the files that changed; the database is copied
     whole every time.
   - **Database**, **Media library** and **Private files** (ticket
     attachments, CVs, invoices): leave all three **Included**.
   - **Full backups to keep**: how many full backups (each with the
     incrementals after it) are kept before the oldest are deleted.
2. **S3**, **Google Drive** and **FTP / SFTP**: switch on one or more.
   - **S3**: Amazon S3 or anything S3-compatible (Backblaze B2, Cloudflare
     R2, Wasabi, DigitalOcean Spaces, MinIO). You need a private bucket and
     an access key allowed to read, write, list and delete in it.
   - **Google Drive**: you need a Google OAuth client; save its ID and
     secret, then press **Connect Google Drive**.
   - **FTP / SFTP**: SFTP (recommended), FTPS or FTP — a server you control,
     such as a NAS reachable from the internet.
3. Save, then press **Test the connection** on each destination's tab. It
   writes a small file, reads it back and deletes it.

Then, on **System → Backups**, press **Full backup** under **Back up now** and
wait until the backup's status says **Complete**. (**Partly sent** means it
did not reach every destination.)

## Restoring

**System → Backups**: press **Restore…** beside a backup, or use **Find
backups on a destination**, which is the way in after moving to a new server.

1. Under **What to put back**, choose the database and the files, the
   database only, or the files only.
2. Type **RESTORE** to confirm.
3. A safety copy of the current database is taken first, so a restore of the
   wrong backup can itself be undone.
4. While the database is replaced, the site's console and checkout pause.
   The public pages keep showing.

## Moving to a new server

1. Install the same (or a newer) version on the new server with the setup
   wizard, using a new empty database.
2. Copy the **`APP_KEY`** line from your old `config/api.env` into the new one
   (replace the line the wizard wrote). The API keeps a cached copy of that
   file, so in File Manager also delete
   `altis-tech-cms/api/bootstrap/cache/config.php`; the API then reads the
   new key on its next request.
3. **System → Backup settings**: set up the same destination.
4. **System → Backups → Find backups on a destination**, choose the
   destination and the latest backup, press **Restore…**, and choose **The
   database and the files**.

Without the old `APP_KEY`, a restore still works, but the encrypted settings
(mail password, payment keys) and any tickets marked sensitive cannot be
read. You would have to type the settings in again.

## Things to know

- The **scheduler** must be running for scheduled backups (see
  [23 — Troubleshooting](23-troubleshooting.md)). A backup started with
  **Full backup** or **Incremental backup** also waits for it.
- Before every update a separate **safety copy** of the database is taken on
  the server. It is kept for 14 days and is not a substitute for an
  off-server backup.
- If a backup fails, the address under **Tell this address when a backup
  fails** receives an email (the support address if that is blank).
