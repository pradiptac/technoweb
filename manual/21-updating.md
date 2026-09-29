# 21 — Updating

*Administrator only.*

Your supplier sends each new version as one file, `altis-tech-cms-<version>.zip`.
It might carry a bug fix, a new colour palette or theme, or a whole new
module. You apply it from the console: there is nothing to type on the
server, and you do not need to read developer notes.

## What happens when you press Apply

1. **The file is checked.** It must be signed by your supplier and newer than
   what you run. A file changed after your supplier made it is refused.
2. **A safety copy of the database** is taken on the server.
3. **Maintenance begins.** The console and the shop's checkout pause for a
   few minutes. The public pages keep showing.
4. **The new version is unpacked beside the old one**, and every file is
   checked against its signed list.
5. **The new API goes in**, the database is updated if the release needs it,
   and any one-off tasks the release carries are run.
6. **The website is restarted** on the new version, and its pages are
   refreshed.
7. **Maintenance ends.** The previous version stays on the server, so you can
   go back.

It usually takes two to five minutes. **Keep the page open until it
finishes.** If you close it by accident, open **System → Updates** again and
it carries on from where it was.

## Applying an update

1. Download the zip your supplier sent.
2. Open **System → Updates** and press **Upload a release zip**. A large file
   uploads in small pieces, so your host's upload limit does not matter.
   *Or* upload the zip with FTP or the hosting panel's File Manager into
   `altis-tech-cms/updates/`, then reload the Updates screen.
3. The update appears under **Updates waiting**, with:
   - **Signed by your supplier**, which must be there;
   - **Changes the database**, when it does;
   - **What is new**, the list of changes since your version (press it to
     open the list).

   If the file cannot be applied, the reason is written under it in red
   instead of an **Apply** button — for example, that it is older than what
   you run, or that another version must be applied first.
4. Press **Apply**, then **Apply the update** to confirm.

## If it stops part-way

The screen says which step stopped and why, in plain words.

- **Stopped before "Putting the new API in place"**: nothing on the live site
  changed and the site is open again. Fix what it says (usually disk space),
  then press **Try this step again**, or **Put this update aside**.
- **Stopped after that**: the site's console stays paused so nothing is half
  written. Press **Try this step again**. If it stops again, press
  **Roll back** and send your supplier the text under **What happened so
  far**.
- **Waiting at "Restarting the website" for more than two minutes**: open
  the hosting panel's Node.js app page and press **Restart**. The update then
  carries on by itself.

## Going back (rollback)

On **System → Updates**, the **Go back to the previous version** box says
which version is still on the server. Press **Roll back…** and confirm to put
it back.

- If the last update **did not** change the database, nothing is lost.
- If it **did**, the safety copy taken just before the update is restored as
  well. **Anything written since the update is lost**: orders, tickets,
  sign-ups and edits. Roll back straight away or not at all, and tell your
  supplier why.

Only the latest update can be rolled back.

## Things to know

- **Never edit the program's files on the server.** The next update replaces
  them, and the changes are lost without warning.
- An update never touches `config/` (your settings) or `storage/` (your
  uploads and backups).
- You can skip versions: an update carries everything since your version. If
  a version cannot be skipped, the screen tells you which one to apply first.
- Take a normal backup to an off-server destination before a big update, as
  well as the automatic safety copy. See
  [22 — Backups and restore](22-backups-and-restore.md).
