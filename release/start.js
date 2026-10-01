"use strict";

/*
 * The website's startup file — what the hosting panel's Node.js app runs.
 *
 * cPanel's "Setup Node.js App" and Plesk's Node.js extension both start an
 * application through Phusion Passenger, which needs one file to run. This is
 * it: it reads the install's settings from `../config/web.env` — written by
 * the setup wizard, never touched by an update — into the environment, and
 * then hands over to Next's standalone `server.js`.
 *
 * A value already set in the panel's own "environment variables" box wins
 * over the file, so a host that prefers configuring there still can. Nothing
 * else here may assume a shell: shared hosting often has none.
 *
 * Restarting the site after an update is `touch tmp/restart.txt` in this
 * folder, which is how Passenger is told to reload an application.
 */

const fs = require("node:fs");
const path = require("node:path");

const configDir = process.env.TW_CONFIG_DIR || path.join(__dirname, "..", "config");
const envFile = path.join(configDir, "web.env");

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;

    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);

    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
} else {
  // Loud rather than silent: a site started without its settings renders
  // pages that cannot reach the API, which reads as a broken release.
  console.warn(`[technoware] ${envFile} not found — run the setup wizard, or set the variables in the hosting panel.`);
}

process.env.NODE_ENV = "production";

require("./server.js");
