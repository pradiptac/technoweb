import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty";
import { getSystemStatus } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { formatDate } from "@/lib/dates";
import { noIndex } from "@/lib/no-index";
import { buildMetadata } from "@/lib/seo";
import { APP_VERSION } from "@/lib/version";
import type { SystemStatus } from "@/types/system";

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

        <Card interactive={false} padding="sm" as="section" className="min-w-0">
          <h2 className="mb-3 text-15 font-semibold">The scheduler</h2>
          <p className="text-13-5">
            {status.scheduler.running
              ? <Badge tone="resolved">Running</Badge>
              : <Badge tone="urgent">Not running</Badge>}
            <span className="ml-2 text-muted">
              {status.scheduler.last_run_seconds == null ? "It has never run." : `Last seen ${status.scheduler.last_run_seconds} seconds ago.`}
            </span>
          </p>
          {!status.scheduler.running && (
            <p className="mt-2 text-13 text-muted">
              Mail, backups and reminders wait for it. Add the cron job from <code className="font-mono [overflow-wrap:anywhere]">MANUAL/23-troubleshooting.md</code>.
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
