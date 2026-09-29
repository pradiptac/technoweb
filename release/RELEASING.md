# Releasing a version

The checklist for sending a change, of any size, to the installs. The
mechanism behind each step is in `docs/distribution.md`.

**Every change ships as a full, signed release zip.** A bug fix, a new colour
palette, a new site theme and a new module all go out the same way. Never send
loose files or edit code on a customer's server: the updater would overwrite
it, and its drift check (System → Updates) would flag it first.

## What each kind of change needs

| Change | Version | What you do beyond the code |
|---|---|---|
| Bug fix | patch (`0.96.1`) | nothing |
| New colour palette (`web/src/lib/presets.ts`) | minor | `npm run themes` must pass (the contrast gate) |
| New site theme (`web/src/themes/<id>/`) | minor | register it in `manifests.ts`, `index.ts`, `themes.css`; run the audits under it |
| New module | minor | migrations, `SettingsSeeder` rows, `RoleSeeder` if a role is new, the nav row. A one-off action (rebuild an index, move a value) is an **upgrade step** class in `api/app/Support/Upgrade/Steps/`, listed in `UpgradeSteps::STEPS`, never a "run this after deploying" line |
| Data change an old version cannot survive | major | raise `min_from` in `release/release.config.json` to the release every install must pass through first |

The updater runs, on every install, in this order: migrations,
`SettingsSeeder`, `RoleSeeder`, pending upgrade steps, `optimize`, a restart
of the website, and a refresh of its cached pages. You do not have to tell a
customer to do any of that.

## The steps

1. **Finish the work** on `phase-3-admin-cms` and pass the Definition of Done
   in `CLAUDE.md`: `npm run audit`, `npm run audit:mobile`, `php artisan test`,
   `composer analyse`, `npx tsc --noEmit`, `npm run lint`.
2. **Bump the version** in `web/src/lib/version.ts`, and add the
   `## X.Y.Z — YYYY-MM-DD` entry at the top of `VERSION.md`. Write that entry
   for the customer's administrator: it is shown on System → Updates before
   they press Apply.
3. **Update the manual** (`manual/`) if a screen changed.
4. **Merge to `main`.**
5. **Build.** Either run the workflow under Actions → Release → "Run workflow"
   on `main` and download the artifact, or build here:

   ```
   node release/build.mjs
   ```

   It refuses a dirty tree and a version without a changelog entry. The zip
   is `release/dist/altis-tech-cms-X.Y.Z.zip`, with a `.sha256` beside it.
   (`--worktree` builds from uncommitted changes, for testing only. Such a
   zip is marked as a test build and the updater refuses it.)
6. **Test the update on a staging install** that is still on the previous
   version. Keep one cPanel and one Plesk staging account for this. Apply it
   through System → Updates, click through the changed screens, then roll
   back and apply again.
7. **Send it.** Give the customer a download link to the zip, the changelog
   entry, and `MANUAL/21-updating.md`. Record in your customer register which
   install is on which version.
8. The customer (or you, with their admin login) uploads it on
   **System → Updates**, or drops it in `~/altis-tech-cms/updates/` over FTP,
   and presses **Apply**.

## The signing key

`node release/build.mjs --init-key` was run once, and wrote:

- `release/keys/release-signing.pem`, the **private** key. It is gitignored.
  Keep a copy in a password manager, and store it as the `RELEASE_SIGNING_KEY`
  secret in the GitHub repository for the Actions build.
- `api/config/release.php`, the **public** key, committed and shipped.

Every install trusts only zips signed with that key. If the private key is
lost, you can build no update those installs will accept: each would then need
a new `api/config/release.php` copied onto it by hand. If the key is leaked,
anybody can sign a zip the installs will run. In that case generate a new key,
ship a release carrying the new public key signed with the **old** key, and
from then on sign with the new one.
