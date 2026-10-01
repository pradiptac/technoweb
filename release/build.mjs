#!/usr/bin/env node
/**
 * Build the release zip a customer installs or updates from.
 *
 *   node release/build.mjs                 # from committed code (HEAD)
 *   node release/build.mjs --worktree      # include uncommitted changes (testing only)
 *   node release/build.mjs --init-key      # once: create the signing key pair
 *
 * What comes out is `release/dist/altis-tech-cms-<version>.zip` (+ `.sha256`):
 *
 *   altis-tech-cms-<version>/
 *     api/        Laravel with vendor/ installed, no tests, no .env, no storage
 *     web/        Next's standalone server + static assets + start.js
 *     config/     empty — the setup wizard writes api.env and web.env here
 *     storage/    Laravel's storage skeleton, outside the code (bootstrap/home.php)
 *     updates/    where a later release zip can be dropped by FTP
 *     MANUAL/     the administrator's manual (manual/ in the repo)
 *     release.json, release.json.sig
 *
 * **The build happens in a staging copy** (`release/work/`), never in `web/`
 * or `api/`: a `next build` in the folder a `next dev` is serving corrupts
 * the dev server (CLAUDE.md), and `composer install --no-dev` there would
 * strip the developer's test tools.
 *
 * **The web half is portable** (`TW_PORTABLE_BUILD=1`): one build for every
 * install, configured by `config/web.env` when it starts. See next.config.ts
 * and lib/build-phase.ts for what that changes.
 *
 * **Native binaries.** The only one the standalone server loads is `sharp`
 * (the image optimiser). On Linux the right one is already there; built on
 * Windows or macOS, the Linux x64 glibc build of sharp is fetched and put in
 * its place, and every other platform's copy is removed. GitHub Actions
 * (`.github/workflows/release.yml`) builds on Linux and is the normal route.
 *
 * **Signed.** `release.json` lists every shipped file's sha256 and is signed
 * with Ed25519; the updater refuses a zip whose signature does not verify
 * against the public key in `api/config/release.php`. The private key lives
 * in `release/keys/` (gitignored) or the `RELEASE_SIGNING_KEY` environment
 * variable (PEM), and never ships.
 */

import { execFileSync, execSync } from "node:child_process";
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The product's name, as people see it, and as a file and folder name.
 *
 * "ALTIS TECH-CMS" from 0.97.0; the id has no spaces or capitals because it
 * becomes the zip's name and the folder a customer unpacks into, which ends up
 * in cron lines and panel paths, where a space breaks things and Linux is
 * case-sensitive. Installs from before the rename carry `technoware`, which
 * `ReleasePackage` still accepts.
 */
const PRODUCT_NAME = "ALTIS TECH-CMS";
const PRODUCT_ID = "altis-tech-cms";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = path.join(ROOT, "release");
const WORK = path.join(RELEASE, "work");
const DIST = path.join(RELEASE, "dist");
const KEY_FILE = path.join(RELEASE, "keys", "release-signing.pem");
const PUBLIC_KEY_PHP = path.join(ROOT, "api", "config", "release.php");

const args = new Set(process.argv.slice(2));
const isWin = process.platform === "win32";

function log(message) {
  console.log(`\n\u001b[1m▸ ${message}\u001b[0m`);
}

function run(command, cwd, env = {}) {
  execSync(command, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

function capture(command, cwd = ROOT) {
  return execSync(command, { cwd, encoding: "utf8" }).trim();
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5 });
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

/* ------------------------------------------------------------ signing key */

if (args.has("--init-key")) {
  if (fs.existsSync(KEY_FILE)) {
    console.error(`${KEY_FILE} already exists. Delete it deliberately if you mean to replace it — every install trusts the old public key until it is updated.`);
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writePublicKey(publicKey.export({ format: "jwk" }).x);

  console.log(`Private key: ${KEY_FILE}\nPublic key written to ${path.relative(ROOT, PUBLIC_KEY_PHP)}.`);
  console.log("Keep a copy of the private key somewhere safe (a password manager). Losing it means no install can be updated until each is given a new public key by hand.");
  process.exit(0);
}

function writePublicKey(jwkX) {
  const b64 = Buffer.from(jwkX, "base64url").toString("base64");
  const php = `<?php

/*
 * The public half of the key releases are signed with (release/build.mjs).
 *
 * The updater refuses a release zip whose \`release.json.sig\` does not verify
 * against this key, which is what stops a tampered or third-party zip being
 * installed through System → Updates. Replacing it is a deliberate act: an
 * install only trusts a new key once a release carrying it has been applied.
 */

return [
    /*
     * A \`--worktree\` build is a supplier's test, never a release. Refused
     * unless this is on — for the supplier's own staging install only, set in
     * its config/api.env. Never on a customer's.
     */
    'allow_test_builds' => (bool) env('RELEASE_ALLOW_TEST_BUILDS', false),

    'public_key' => '${b64}',
];
`;
  fs.writeFileSync(PUBLIC_KEY_PHP, php);
}

function signingKey() {
  const pem = process.env.RELEASE_SIGNING_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : null);

  if (!pem) {
    console.error("No signing key. Run `node release/build.mjs --init-key` once, or set RELEASE_SIGNING_KEY.");
    process.exit(1);
  }

  return createPrivateKey(pem);
}

/* --------------------------------------------------------------- preflight */

const versionTs = fs.readFileSync(path.join(ROOT, "web/src/lib/version.ts"), "utf8");
const version = versionTs.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];

if (!version) throw new Error("APP_VERSION not found in web/src/lib/version.ts");

const changelog = fs.readFileSync(path.join(ROOT, "VERSION.md"), "utf8");

if (!changelog.includes(`## ${version} `)) {
  console.error(`VERSION.md has no "## ${version} — …" entry. Every release needs one: it is what the customer reads before pressing Apply.`);
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(path.join(RELEASE, "release.config.json"), "utf8"));
const commit = capture("git rev-parse --short HEAD");
const dirty = capture("git status --porcelain -- api web manual release") !== "";
const worktree = args.has("--worktree");

if (dirty && !worktree) {
  console.error("api/, web/, manual/ or release/ has uncommitted changes. Commit them, or pass --worktree to build a test release from the working tree (never send one of those to a customer).");
  process.exit(1);
}

const key = signingKey();
const name = `${PRODUCT_ID}-${version}${worktree ? "-worktree" : ""}`;
const STAGE = path.join(WORK, "stage");
const PKG = path.join(WORK, name);

log(`Building ${name} (${commit}${worktree ? ", working tree" : ""}) on ${process.platform}`);

rm(WORK);
fs.mkdirSync(STAGE, { recursive: true });

/* --------------------------------------------------- source into staging */

// Tracked files only — the working tree's copies of them with --worktree,
// plus untracked files that are not ignored — so nothing a developer has
// lying around (a .env, a probe, a dump) can end up in a customer's zip.
function sourceFiles(dir) {
  const list = capture(`git ls-files -z${worktree ? " --cached --others --exclude-standard" : ""} -- ${dir}`);
  return [...new Set(list.split("\0").filter(Boolean))];
}

log("Copying sources");

for (const dir of worktree ? ["api", "web", "manual"] : []) {
  for (const rel of sourceFiles(dir)) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) continue; // deleted in the working tree
    const to = path.join(STAGE, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

// The committed tree exactly, through a throwaway index so the developer's
// own index is never touched. `checkout-index` applies .gitattributes, so PHP
// and artisan come out LF on any machine.
if (!worktree) {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(WORK, "index.tmp") };
  const paths = capture("git ls-tree -r -z --name-only HEAD -- api web manual");

  execFileSync("git", ["read-tree", "HEAD"], { cwd: ROOT, env });
  execFileSync("git", ["checkout-index", "-f", "-z", "--stdin", `--prefix=${STAGE.split(path.sep).join("/")}/`], {
    cwd: ROOT, env, input: paths,
  });
  rm(path.join(WORK, "index.tmp"));
}

/* -------------------------------------------------------------------- API */

log("API: composer install --no-dev");

const apiStage = path.join(STAGE, "api");

// .env.example stays: the setup wizard builds config/api.env from it.
for (const junk of ["tests", "phpunit.xml", "scripts", ".env", ".env.testing", "phpstan.neon", "phpstan-baseline.neon", "README.md"]) {
  rm(path.join(apiStage, junk));
}

run("composer install --no-dev --optimize-autoloader --no-interaction --no-progress --no-scripts", apiStage);
// The framework's own discovery, without the dev `post-autoload-dump` hooks
// that expect a .env; this is what `package:discover` writes into bootstrap/cache.
run("php artisan package:discover --ansi", apiStage, { APP_KEY: "base64:" + Buffer.alloc(32).toString("base64") });

fs.writeFileSync(
  path.join(apiStage, "version.json"),
  JSON.stringify({ version, commit, built_at: new Date().toISOString() }, null, 2) + "\n",
);

/* -------------------------------------------------------------------- web */

log("Web: npm ci + portable build");

const webStage = path.join(STAGE, "web");
rm(path.join(webStage, ".env"));

run("npm ci --no-audit --no-fund", webStage);
run("npx next build", webStage, {
  TW_PORTABLE_BUILD: "1",
  // A port nothing listens on: a portable build has no API, and must never
  // read the developer's (which would bake their content into the pages).
  API_BASE_URL: "http://127.0.0.1:59999",
  ASSET_ORIGIN: "",
  NEXT_PUBLIC_SITE_URL: "",
  SITE_THEME: "",
  NEXT_TELEMETRY_DISABLED: "1",
});

const standalone = path.join(webStage, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error(`No server.js in ${standalone} — is output: "standalone" set in next.config.ts?`);
}

/* ---------------------------------------------------------------- package */

log("Assembling the package");

rm(PKG);
fs.mkdirSync(PKG, { recursive: true });

// api/ — its storage skeleton moves out beside it (bootstrap/home.php).
copyDir(apiStage, path.join(PKG, "api"));
fs.renameSync(path.join(PKG, "api", "storage"), path.join(PKG, "storage"));
rm(path.join(PKG, "api", "public", "storage")); // a developer's storage:link, if the tree had one

// web/ — the standalone server, its static assets, the launcher.
const webPkg = path.join(PKG, "web");
copyDir(standalone, webPkg);
copyDir(path.join(webStage, ".next", "static"), path.join(webPkg, ".next", "static"));
copyDir(path.join(webStage, "public"), path.join(webPkg, "public"));
fs.copyFileSync(path.join(RELEASE, "start.js"), path.join(webPkg, "start.js"));
fs.mkdirSync(path.join(webPkg, "tmp"), { recursive: true });
rm(path.join(webPkg, ".env"));
rm(path.join(webPkg, ".next", "cache"));

linuxNativeModules(webPkg);

// The folders an update never touches.
for (const dir of ["config", "updates"]) fs.mkdirSync(path.join(PKG, dir), { recursive: true });
fs.copyFileSync(path.join(RELEASE, "skeleton", "config.README.txt"), path.join(PKG, "config", "README.txt"));
fs.copyFileSync(path.join(RELEASE, "skeleton", "updates.README.txt"), path.join(PKG, "updates", "README.txt"));

// The manual, and the changelog a customer reads.
copyDir(path.join(STAGE, "manual"), path.join(PKG, "MANUAL"));
fs.writeFileSync(path.join(PKG, "MANUAL", "CHANGELOG.md"), changelog);

/* --------------------------------------------------------- release.json */

log("Hashing and signing");

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

const files = {};
for (const top of ["api", "web"]) {
  for (const rel of walk(path.join(PKG, top))) {
    const full = path.join(PKG, top, rel);
    files[`${top}/${rel}`] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  }
}

const migrations = fs
  .readdirSync(path.join(PKG, "api", "database", "migrations"))
  .filter((f) => f.endsWith(".php"))
  .map((f) => f.slice(0, -4))
  .sort();

const release = {
  product: PRODUCT_ID,
  product_name: PRODUCT_NAME,
  version,
  commit,
  built_at: new Date().toISOString(),
  worktree,
  min_from: settings.min_from,
  requires: { php: settings.php_min, node: settings.node_min },
  schema: migrations.at(-1) ?? "",
  migrations,
  changelog: changelogSince(changelog, settings.changelog_entries ?? 20),
  files,
};

const releaseJson = JSON.stringify(release, null, 1) + "\n";
fs.writeFileSync(path.join(PKG, "release.json"), releaseJson);
fs.writeFileSync(path.join(PKG, "release.json.sig"), sign(null, Buffer.from(releaseJson), key).toString("base64") + "\n");

/* -------------------------------------------------------------------- zip */

log("Zipping");

fs.mkdirSync(DIST, { recursive: true });
const zipPath = path.join(DIST, `${name}.zip`);
execFileSync("php", [path.join(RELEASE, "zip.php"), PKG, zipPath, name], { stdio: "inherit" });

const digest = createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
fs.writeFileSync(`${zipPath}.sha256`, `${digest}  ${path.basename(zipPath)}\n`);

const mb = (fs.statSync(zipPath).size / 1048576).toFixed(1);
log(`Done: ${path.relative(ROOT, zipPath)} (${mb} MB, ${Object.keys(files).length} files)`);

if (worktree) console.log("  This is a --worktree build: for testing only, never for a customer.");

/* ---------------------------------------------------------------- helpers */

/** The newest `count` VERSION.md entries, as {version, date, text}. */
function changelogSince(markdown, count) {
  const entries = [];
  const re = /^## (\S+) — (\S+)\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm;
  let m;
  while ((m = re.exec(markdown)) !== null && entries.length < count) {
    entries.push({ version: m[1], date: m[2], text: m[3].trim() });
  }
  return entries;
}

/**
 * Make the standalone server's native modules the Linux x64 (glibc) ones.
 *
 * A build on Linux needs nothing. Anywhere else, the platform's own sharp
 * binaries were traced in; they are removed and the Linux ones fetched with
 * npm's cross-platform install (`--os/--cpu/--libc`), at the exact version
 * the build used.
 */
function linuxNativeModules(webDir) {
  const modules = path.join(webDir, "node_modules");
  const foreign = /(win32|darwin|freebsd|android|linux-arm|linux-x64-musl|linuxmusl|wasm32)/;

  const sharpPkg = path.join(modules, "sharp", "package.json");
  const img = path.join(modules, "@img");

  if (process.platform === "linux" && os.arch() === "x64") {
    return;
  }

  for (const scope of ["@img", "@next"]) {
    const dir = path.join(modules, scope);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (foreign.test(entry)) rm(path.join(dir, entry));
    }
  }

  if (!fs.existsSync(sharpPkg)) {
    console.log("  sharp is not in the standalone trace; nothing native to replace.");
    return;
  }

  const sharpVersion = JSON.parse(fs.readFileSync(sharpPkg, "utf8")).version;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-sharp-"));

  log(`Fetching sharp ${sharpVersion} for linux-x64 (glibc)`);
  fs.writeFileSync(path.join(tmp, "package.json"), "{}");
  run(`npm install --no-save --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc sharp@${sharpVersion}`, tmp);

  fs.mkdirSync(img, { recursive: true });
  for (const entry of fs.readdirSync(path.join(tmp, "node_modules", "@img"))) {
    if (/linux-x64/.test(entry) && !/musl/.test(entry)) {
      rm(path.join(img, entry));
      copyDir(path.join(tmp, "node_modules", "@img", entry), path.join(img, entry));
      console.log(`  + @img/${entry}`);
    }
  }
  rm(tmp);

  const leftovers = walk(modules).filter((f) => f.endsWith(".node") && foreign.test(f));
  if (leftovers.length > 0) {
    console.warn(`  Native files for another platform remain:\n    ${leftovers.join("\n    ")}`);
  }
}
