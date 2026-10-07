import type { ReactNode } from "react";
import { CopyText } from "@/components/admin/copy-text";
import type { SchedulerSetup } from "@/types/system";
import { CheckAgain } from "./check-again";

/**
 * The scheduler's command for this server, and where to put it (0.128.0,
 * docs/distribution.md "The scheduler's command").
 *
 * The line is the API's — `scheduler.setup` on the status read, worked out
 * by `SchedulerSetup` from the server answering and, where the host allows,
 * tested by running it. Nothing here composes a path: this component only
 * says what the API found, in the words of whichever control panel it found,
 * with the others one fold away for the server it guessed wrong. "Check
 * again" is `router.refresh()` (`check-again.tsx`): a link to this same route
 * would be answered from the router's own copy.
 *
 * A command is `<pre>` in a scroll box of its own (`w-0 min-w-full`: a
 * scroll container still gives its content's width to the grid item holding
 * it, and a 120-character line would widen the card on a phone).
 */
export function SchedulerGuide({ setup, running }: { setup: SchedulerSetup; running: boolean }) {
  // A Windows machine is offered Windows; a Linux one the panel that was
  // found first and the other two a fold away, for the server guessed wrong.
  const windows = setup.os === "windows";
  const first: Kind = windows ? "windows" : setup.panel ?? "ssh";
  const rest = windows ? [] : (["plesk", "cpanel", "ssh"] as Kind[]).filter((k) => k !== first);

  const guide = (
    <div className="mt-3 grid gap-4 text-13-5">
      <p className="measure text-muted">
        One task, run every minute, sends the mail and runs the backups, reminders, imports and messages. While it is
        not running they simply wait, and nothing reports an error.
      </p>

      <div>
        <h3 className="mb-1.5 text-13-5 font-semibold">The command for this server</h3>
        <Command text={setup.command} />
        <Diagnosis setup={setup} />
      </div>

      <div>
        <h3 className="mb-1.5 text-13-5 font-semibold">{TITLE[first]}</h3>
        <Steps kind={first} setup={setup} />
      </div>

      {rest.length > 0 && (
        <details className="rounded-md border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-13 font-semibold text-brand-ink">A different control panel, or a terminal</summary>
          <div className="mt-3 grid gap-4">
            {rest.map((kind) => (
              <div key={kind}>
                <h3 className="mb-1.5 text-13-5 font-semibold">{TITLE[kind]}</h3>
                <Steps kind={kind} setup={setup} />
              </div>
            ))}
          </div>
        </details>
      )}

      {setup.dev && !windows && (
        <div>
          <p className="measure mb-2 text-muted">
            On a development machine, leaving this running in a terminal does the same job for as long as it stays open:
          </p>
          <Command text={setup.work} />
        </div>
      )}

      <p className="measure text-muted">
        Then come back to this screen: within two minutes the scheduler reads <strong className="text-ink">Running</strong>.{" "}
        <CheckAgain />
      </p>
    </div>
  );

  // Running: the answer is on file for the day it stops, not in the way.
  return running ? (
    <details className="mt-3">
      <summary className="cursor-pointer text-13 font-semibold text-brand-ink">The command, and how it is set up</summary>
      {guide}
    </details>
  ) : guide;
}

type Kind = "plesk" | "cpanel" | "ssh" | "windows";

const TITLE: Record<Kind, string> = {
  plesk: "In Plesk",
  cpanel: "In cPanel",
  ssh: "From a terminal (SSH)",
  windows: "On Windows",
};

function Command({ text }: { text: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <pre className="w-0 min-w-full flex-1 overflow-x-auto rounded border border-line-strong bg-surface px-2.5 py-2 font-mono text-12 text-ink sm:min-w-0">
        <code>{text}</code>
      </pre>
      <CopyText text={text} />
    </div>
  );
}

/** What testing the command found, in words — or that it could not be tested. */
function Diagnosis({ setup }: { setup: SchedulerSetup }) {
  const path = <code className="font-mono [overflow-wrap:anywhere]">{setup.php}</code>;

  if (setup.php_checked === true) {
    return <p className="mt-2 text-13 text-ok">Checked just now: PHP {setup.php_version} runs from the command line at {path}.</p>;
  }

  if (setup.php_checked === false) {
    return (
      <p className="mt-2 text-13 text-err">
        {setup.php_version
          ? <>The PHP at {path} is {setup.php_version}, which cannot run this site from the command line. </>
          : <>Nothing could be run at {path}. </>}
        Ask your host for the path to the PHP 8.3 (or newer) command line, and use it in place of the first part of the command.
      </p>
    );
  }

  return (
    <p className="mt-2 text-13 text-warn">
      This server does not let the website try the command itself, which is common on shared hosting.{" "}
      {setup.php === "php"
        ? <>The path to PHP could not be worked out either, so the command says plain <code className="font-mono">php</code>. </>
        : <>The path {path} is the usual one for this kind of server. </>}
      If the scheduler does not start, ask your host for “the path to the PHP 8.3 command line” and use it in place of the first part.
    </p>
  );
}

function Steps({ kind, setup }: { kind: Kind; setup: SchedulerSetup }) {
  const list = (items: ReactNode[]) => (
    <ol className="measure grid list-decimal gap-1.5 pl-5 text-13-5">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ol>
  );
  const b = (text: string) => <strong className="font-semibold">{text}</strong>;

  if (kind === "plesk") {
    return list([
      <>Open {b("Websites & Domains")}, find the domain the API is on, and choose {b("Scheduled Tasks")}. Press {b("Add Task")}.</>,
      <>Task type: {b("Run a command")}. Paste the command above into {b("Command")}.</>,
      <>Run: choose {b("Cron style")} and type <code className="font-mono">* * * * *</code> — every minute.</>,
      <>Leave the system user as the domain’s own, set Notify to {b("Do not notify")}, and press {b("OK")}.</>,
    ]);
  }

  if (kind === "cpanel") {
    return list([
      <>Open {b("Cron Jobs")} (under Advanced).</>,
      <>Under {b("Common Settings")} choose {b("Once Per Minute (* * * * *)")}.</>,
      <>Paste the command above into {b("Command")} and press {b("Add New Cron Job")}.</>,
    ]);
  }

  if (kind === "ssh") {
    return (
      <>
        {list([
          <>Sign in as {setup.user ? <>the user <code className="font-mono">{setup.user}</code></> : "the user that owns the site’s files"} — not as root, or the files it writes will belong to root.</>,
          <>Run <code className="font-mono">crontab -e</code>, add this on a line of its own, and save:</>,
        ])}
        <div className="mt-2">
          <Command text={setup.cron ?? `* * * * * ${setup.command} >> /dev/null 2>&1`} />
        </div>
      </>
    );
  }

  return (
    <>
      <p className="measure text-13-5">
        Windows has no cron. On a development machine, open a terminal and leave this running — it does the same job
        for as long as the window stays open:
      </p>
      <div className="mt-2"><Command text={setup.work} /></div>
      {setup.windows_task && (
        <>
          <p className="measure mt-3 text-13-5">
            To have Windows run it by itself every minute, open {b("Command Prompt")} as an administrator and run this once:
          </p>
          <div className="mt-2"><Command text={setup.windows_task} /></div>
        </>
      )}
    </>
  );
}
