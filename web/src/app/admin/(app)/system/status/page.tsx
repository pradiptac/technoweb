import { headers } from "next/headers";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty";
import { getSystemStatus } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { cdnInFront, clientIpSetting } from "@/lib/cdn";
import { formatDate } from "@/lib/dates";
import { noIndex } from "@/lib/no-index";
import { buildMetadata } from "@/lib/seo";
import { APP_VERSION } from "@/lib/version";
import type { SystemStatus } from "@/types/system";
import { SchedulerGuide } from "./scheduler-guide";

export const metadata = buildMetadata({ title: "System status", path: "/admin/system/status", seo: noIndex });

/**
 * System → Status (docs/distribution.md): which release is installed, and
 * whether its three moving parts — the API, the website and the scheduler —
 * agree with each other. The questions a support call starts with, answered
 * before anybody has to ask them over the phone.
 */
export default async function SystemStatusPage() {
  await requireScreen();
  let status: SystemStatus;

  try {
    status = await getSystemStatus();
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  const schemaCurrent = status.code_schema === status.database_schema;
  const webMatches = status.website.version === status.version.version;
  const failing = status.php.checks.filter((c) => !c.ok);
  const gb = (bytes: number | null) => (bytes === null ? "—" : `${(bytes / 1024 ** 3).toFixed(1)} GB`);
  // A CDN in front of the whole site (docs/cdn.md), read from this very
  // request, and whether the website has been told which header names the
  // visitor behind it.
  const incoming = await headers();
  const cdn = cdnInFront((name) => incoming.get(name));
  const ipHeader = clientIpSetting();

  return (
    <>
      <PageHeader
        title="System status"
        lede="Which version is installed, and whether the API, the website and the scheduler are all running it."
      >
        <ButtonLink href="/admin/system/updates" variant="secondary" size="sm" className="ml-auto">Updates</ButtonLink>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card interactive={false} padding="sm" as="section" className="min-w-0">
          <h2 className="mb-3 text-15 font-semibold">Installed version</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2 text-13-5 [&_dd]:[overflow-wrap:anywhere]">
            <dt className="text-muted">API</dt>
            <dd className="font-mono">{status.version.version}{status.version.commit ? ` (${status.version.commit})` : ""}</dd>
            <dt className="text-muted">Console</dt>
            <dd className="font-mono">{APP_VERSION}</dd>
            <dt className="text-muted">Built</dt>
            <dd>{formatDate(status.version.built_at, "long")}</dd>
            <dt className="text-muted">Installed</dt>
            <dd>{status.installed?.installed_at ? `${formatDate(status.installed.installed_at, "long")} (${status.installed.installed_version})` : "A development checkout"}</dd>
            {status.installed?.updated_at && (<><dt className="text-muted">Last updated</dt><dd>{formatDate(status.installed.updated_at, "long")}</dd></>)}
            <dt className="text-muted">Database</dt>
            <dd>
              {schemaCurrent
                ? <Badge tone="resolved">Up to date</Badge>
                : <Badge tone="urgent">Behind the code — finish the update</Badge>}
            </dd>
          </dl>
        </Card>

        <Card interactive={false} padding="sm" as="section" className="min-w-0">
          <h2 className="mb-3 text-15 font-semibold">The website</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2 text-13-5 [&_dd]:[overflow-wrap:anywhere]">
            <dt className="text-muted">Address</dt>
            <dd className="break-all font-mono">{status.website.url}</dd>
            <dt className="text-muted">Running</dt>
            <dd>
              {status.website.reachable
                ? <Badge tone={webMatches ? "resolved" : "progress"}>{status.website.version ?? "unknown"}{webMatches ? "" : " — restart the Node.js app"}</Badge>
                : <Badge tone="urgent">Not answering</Badge>}
            </dd>
            <dt className="text-muted">Reaches the API</dt>
            <dd>{status.website.api === null ? "—" : status.website.api ? "Yes" : <Badge tone="urgent">No</Badge>}</dd>
          </dl>
          {status.website.error && <p className="mt-3 text-13 text-err">{status.website.error}</p>}
        </Card>

        {/* Both columns: it carries a command line and the steps for adding it. */}
        <Card interactive={false} padding="sm" as="section" className="min-w-0 lg:col-span-2">
          {/* The anchor the dashboard's checklist and every "scheduler is not running" notice link to. */}
          <h2 id="scheduler" className="mb-3 scroll-mt-24 text-15 font-semibold">The scheduler</h2>
          <p className="text-13-5">
            {status.scheduler.running
              ? <Badge tone="resolved">Running</Badge>
              : <Badge tone="urgent">Not running</Badge>}
            <span className="ml-2 text-muted">
              {status.scheduler.last_run_seconds == null ? "It has never run." : `Last seen ${status.scheduler.last_run_seconds} seconds ago.`}
            </span>
          </p>
          {status.scheduler.setup
            ? <SchedulerGuide setup={status.scheduler.setup} running={Boolean(status.scheduler.running)} />
            : !status.scheduler.running && (
              <p className="mt-2 text-13 text-muted">
                Mail, backups and reminders wait for it. Add the cron job from <code className="font-mono [overflow-wrap:anywhere]">MANUAL/23-troubleshooting.md</code>.
              </p>
            )}
        </Card>

        <Card interactive={false} padding="sm" as="section" className="min-w-0">
          <h2 className="mb-3 text-15 font-semibold">CDN</h2>
          {/* On the paragraph, not the Card: `Card` passes no unknown attribute through. */}
          <p className="text-13-5" data-cdn-status>
            {cdn
              ? <Badge tone="resolved">Behind {cdn.name}</Badge>
              : <Badge tone="closed">None in front of the website</Badge>}
            <span className="ml-2 text-muted">
              {cdn ? "This request reached the website through it." : "Optional — see the manual’s chapter on using a CDN."}
            </span>
          </p>
          {cdn && ipHeader !== cdn.header && (
            <p className="mt-2 text-13 text-err">
              The website does not know each visitor’s own address, so everybody arriving through one {cdn.name} machine
              shares the same sign-in and form limits. Set <code className="font-mono [overflow-wrap:anywhere]">CLIENT_IP_HEADER={cdn.header}</code> in
              the website’s environment and restart the Node.js app.
            </p>
          )}
          {cdn && ipHeader === cdn.header && (
            <p className="mt-2 text-13 text-ok">Visitors’ own addresses are read from {cdn.name}.</p>
          )}
          {!cdn && ipHeader !== "" && ipHeader !== "x-real-ip" && (
            <p className="mt-2 text-13 text-warn">
              <code className="font-mono">CLIENT_IP_HEADER={ipHeader}</code> is set, but this request did not come through a CDN.
              Anybody reaching this server directly can then choose the address they are limited under — remove it, or
              close the server to everything but the CDN.
            </p>
          )}
        </Card>

        <Card interactive={false} padding="sm" as="section" className="min-w-0">
          <h2 className="mb-3 text-15 font-semibold">The server</h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2 text-13-5 [&_dd]:[overflow-wrap:anywhere]">
            <dt className="text-muted">PHP</dt>
            <dd className="font-mono">{status.php.version}</dd>
            <dt className="text-muted">Time per request</dt>
            <dd>{status.php.max_execution_time === 0 ? "Unlimited" : `${status.php.max_execution_time}s`}</dd>
            <dt className="text-muted">Memory</dt>
            <dd>{status.php.memory_limit}</dd>
            <dt className="text-muted">Disk free</dt>
            <dd>{gb(status.disk.free)} of {gb(status.disk.total)}</dd>
          </dl>
          {failing.length === 0
            ? <p className="mt-3 text-13 text-ok">Every requirement is met.</p>
            : (
              <ul className="mt-3 grid gap-2 text-13">
                {failing.map((c) => (
                  <li key={c.key}>
                    <span className={c.required ? "font-semibold text-err" : "font-semibold text-warn"}>{c.label}</span>
                    <span className="block text-muted">{c.detail}</span>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </>
  );
}
