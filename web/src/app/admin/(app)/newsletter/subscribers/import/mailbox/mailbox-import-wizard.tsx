"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MailboxConnection } from "@/app/admin/(app)/settings/mailbox-connection";
import { DeliveryStatus } from "../../../campaigns/delivery-status";
import { runImportAction } from "../../../actions";
import { Count } from "../count";
import {
  connectNewsletterMailboxAction, disconnectNewsletterMailboxAction, discardImportAction,
  pollImportAction, startScanAction, type MailboxActionState,
} from "./mailbox-actions";
import { formatDate } from "@/lib/dates";
import type { NewsletterGroup, NewsletterMailboxImport, NewsletterMailboxStatus, QueueHealth } from "@/types/api";

/**
 * Import subscribers from a mailbox: source → scanning → review → done.
 *
 * The scan is queued work that runs in slices for as long as the mailbox
 * needs, so the screen polls the import row every three seconds and draws
 * what the row says. It starts on whatever the API reports as the active
 * scan — a page reloaded mid-scan lands back on the progress panel, and one
 * reloaded after the scan lands on the review — rather than on step one.
 *
 * Three ways in, and none of them is kept: a Gmail or Microsoft 365 consent
 * is spent by the scan and forgotten when it ends; IMAP credentials are
 * used for that scan and never stored. The domain table is the reviewer's
 * decision, not the machine's — our own domain and sending infrastructure
 * are unticked by default, and a typed "only these domains" list ticks
 * exactly what it names.
 */

type Step = "source" | "scanning" | "review" | "done";

const PRESETS: { value: string; label: string; months: number | null }[] = [
  { value: "3", label: "Last 3 months", months: 3 },
  { value: "6", label: "Last 6 months", months: 6 },
  { value: "12", label: "Last 12 months", months: 12 },
  { value: "24", label: "Last 2 years", months: 24 },
  { value: "all", label: "All dates", months: null },
  { value: "custom", label: "A range I choose", months: null },
];

const ENCRYPTIONS = [
  { value: "ssl", label: "SSL / TLS (port 993)" },
  { value: "tls", label: "STARTTLS (port 143)" },
  { value: "none", label: "None" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return isoDate(d);
}

/** The API's per-domain verdicts, as the review's starting ticks. */
function defaultTicks(scan: NewsletterMailboxImport | null): Set<string> {
  return new Set((scan?.analysis?.domains ?? []).filter((d) => d.default).map((d) => d.domain));
}

function stepFor(scan: NewsletterMailboxImport | null): Step {
  if (!scan) return "source";
  if (scan.status === "pending" || scan.status === "scanning") return "scanning";
  if (scan.status === "ready") return "review";
  return "source";
}

export function MailboxImportWizard({
  groups, status, queue,
}: {
  groups: NewsletterGroup[];
  status: NewsletterMailboxStatus;
  queue: QueueHealth | null;
}) {
  const [scan, setScan] = useState<NewsletterMailboxImport | null>(status.active);
  const [step, setStep] = useState<Step>(stepFor(status.active));
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<MailboxActionState>({});

  // Source step.
  const [source, setSource] = useState<"connected" | "imap">(status.is_connected ? "connected" : "imap");
  const [provider, setProvider] = useState(status.provider ?? "google");
  const [preset, setPreset] = useState("12");
  const [since, setSince] = useState(monthsAgo(12));
  const [until, setUntil] = useState(isoDate(new Date()));
  const [includeJunk, setIncludeJunk] = useState(false);
  const [imap, setImap] = useState({ host: "", port: "993", encryption: "ssl", username: "", password: "" });

  // Review step.
  const [ticked, setTicked] = useState<Set<string>>(() => defaultTicks(status.active));
  const [includeRoles, setIncludeRoles] = useState(false);
  const [only, setOnly] = useState("");
  const [groupIds, setGroupIds] = useState<number[]>([]);

  const analysis = scan?.analysis ?? null;

  // Poll while a scan runs. The review's starting ticks are set at the
  // moment the scan becomes ready, from the API's per-domain verdicts —
  // an event, not an effect on derived state.
  useEffect(() => {
    if (step !== "scanning" || !scan) return;
    const id = window.setInterval(async () => {
      const fresh = await pollImportAction(scan.id);
      if (!fresh) return;
      setScan(fresh);
      if (fresh.status === "ready") {
        setTicked(defaultTicks(fresh));
        setStep("review");
      }
      if (fresh.status === "failed" || fresh.status === "cancelled" || fresh.status === "expired") setStep("source");
    }, 3000);
    return () => window.clearInterval(id);
  }, [step, scan]);

  const run = (action: () => Promise<MailboxActionState>) =>
    start(async () => setNotice(await action()));

  const choosePreset = (value: string) => {
    setPreset(value);
    const chosen = PRESETS.find((p) => p.value === value);
    if (chosen?.months) {
      setSince(monthsAgo(chosen.months));
      setUntil(isoDate(new Date()));
    }
  };

  const startScan = () => {
    setError(null);
    start(async () => {
      const result = await startScanAction({
        source,
        since: preset === "all" ? null : since || null,
        until: preset === "all" ? null : until || null,
        include_junk: includeJunk,
        ...(source === "imap" ? { imap: { ...imap, port: Number(imap.port) || 993 } } : {}),
      });
      if (result.error || !result.scan) {
        setError(result.error ?? "The scan could not be started.");
        return;
      }
      setScan(result.scan);
      setStep("scanning");
    });
  };

  const discard = () => {
    if (!scan || !window.confirm("Discard this scan? Nothing has been imported; the mailbox would have to be read again.")) return;
    start(async () => {
      const result = await discardImportAction(scan.id);
      if (result.error) { setError(result.error); return; }
      setScan(null);
      setStep("source");
    });
  };

  const applyOnly = () => {
    const wanted = only.toLowerCase().split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean);
    if (wanted.length === 0 || !analysis) return;
    setTicked(new Set(analysis.domains
      .filter((d) => wanted.some((w) => d.domain === w || d.domain.endsWith("." + w)))
      .map((d) => d.domain)));
  };

  const willImport = useMemo(() => {
    if (!analysis) return 0;
    return analysis.domains
      .filter((d) => ticked.has(d.domain))
      .reduce((n, d) => n + d.valid - (includeRoles ? 0 : d.role), 0);
  }, [analysis, ticked, includeRoles]);

  const commit = () => {
    if (!scan || !analysis) return;
    setError(null);
    start(async () => {
      const result = await runImportAction({
        import_id: scan.id,
        mapping: analysis.mapping,
        group_ids: groupIds,
        domains: Array.from(ticked),
        include_roles: includeRoles,
      });
      if (result.error || !result.tally) {
        setError(result.error ?? "That import could not be completed.");
        return;
      }
      setTally(result.tally);
      setStep("done");
    });
  };

  const missingPhp = Object.entries(status.php).filter(([, ok]) => !ok).map(([name]) => name);

  // ------------------------------------------------------------------ done
  if (step === "done" && tally) {
    return (
      <div>
        <Alert tone="ok" title="Import finished">{tally.imported} added, {tally.updated} updated.</Alert>

        <dl className="mb-4 grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-13 sm:max-w-md">
          <Count label="Added" value={tally.imported} />
          <Count label="Already on the list" value={tally.duplicates} />
          <Count label="Updated with new detail" value={tally.updated} />
          <Count label="Left out by the domain and role choices" value={tally.excluded ?? 0} />
          <Count label="Not a valid address" value={tally.invalid} />
          <Count label="Previously unsubscribed" value={tally.suppressed} />
        </dl>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/newsletter/subscribers" size="sm">See the subscribers</ButtonLink>
          <Button type="button" size="sm" variant="secondary" onClick={() => { setTally(null); setScan(null); setStep("source"); }}>
            Scan another mailbox
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- review
  if (step === "review" && scan && analysis) {
    const counts = analysis.counts;

    return (
      <div className="grid gap-5">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <Alert tone="info" title={`${scan.filename} — read`} dismissible={false}>
          {counts.total.toLocaleString("en-IN")} addresses were found. The mailbox has been let go of; the result
          below is kept for a day and then discarded if it is not imported.
        </Alert>

        {analysis.capped && (
          <Alert tone="warn" title="The scan stopped taking new addresses at 50,000" dismissible={false}>
            The addresses it had by then are below. Narrow the date range to get the rest in a second scan.
          </Alert>
        )}

        <dl className="grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-13 sm:max-w-md">
          <Count label="Addresses found" value={counts.total} />
          <Count label="Would be added" value={counts.valid} strong />
          <Count label="Already on the list" value={counts.already_subscribed} />
          <Count label="Previously unsubscribed" value={counts.suppressed} />
          <Count label="Not a valid address" value={counts.invalid} />
          <Count label="Role addresses (noreply@, postmaster@ …)" value={analysis.roles.addresses} />
        </dl>

        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-13 font-semibold">Domains</h2>
            <p className="text-12-5 text-muted">
              <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setTicked(new Set(analysis.domains.map((d) => d.domain)))}>All</button>
              {" · "}
              <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setTicked(new Set())}>None</button>
              {" · "}
              <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setTicked(new Set(analysis.domains.filter((d) => d.default).map((d) => d.domain)))}>Suggested</button>
            </p>
          </div>
          <p className="measure mb-3 text-12-5 text-muted">
            Your own domains and sending infrastructure start unticked. Untick anything else you would rather not mail.
          </p>

          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="admin-table w-full min-w-[520px] text-13">
              <thead>
                <tr className="border-b border-line text-left text-11 uppercase tracking-[.05em] text-muted">
                  <th scope="col" className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                  <th scope="col" className="px-3 py-2">Domain</th>
                  <th scope="col" className="px-3 py-2 text-right">Addresses</th>
                  <th scope="col" className="px-3 py-2 text-right">Would add</th>
                  <th scope="col" className="px-3 py-2">Sample</th>
                </tr>
              </thead>
              <tbody>
                {analysis.domains.map((d) => (
                  <tr key={d.domain} className="border-b border-line last:border-0">
                    <td data-label="Include" className="px-3 py-1.5">
                      <input
                        type="checkbox" className="size-4 accent-brand-600"
                        aria-label={`Include ${d.domain}`}
                        checked={ticked.has(d.domain)}
                        onChange={(e) => {
                          const next = new Set(ticked);
                          if (e.target.checked) next.add(d.domain); else next.delete(d.domain);
                          setTicked(next);
                        }}
                      />
                    </td>
                    <td data-label="Domain" className="px-3 py-1.5">
                      <span className="font-mono text-12-5">{d.domain}</span>
                      {d.kind === "own" && <Badge tone="brand" dot={false} className="ml-2">your domain</Badge>}
                      {d.kind === "machine" && <Badge tone="closed" dot={false} className="ml-2">machine</Badge>}
                    </td>
                    <td data-label="Addresses" className="px-3 py-1.5 text-right tabular-nums">{d.addresses.toLocaleString("en-IN")}</td>
                    <td data-label="Would add" className="px-3 py-1.5 text-right tabular-nums">{d.valid.toLocaleString("en-IN")}</td>
                    <td data-label="Sample" className="max-w-[28ch] truncate px-3 py-1.5 font-mono text-12 text-muted" title={d.sample.join(", ")}>
                      {d.sample.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:max-w-[28rem]">
              <Field label="Only these domains" htmlFor="only-domains" className="mb-0"
                hint="Type domains separated by spaces or commas and press Apply: exactly those are ticked. A domain covers its subdomains.">
                <Textarea id="only-domains" rows={2} value={only} onChange={(e) => setOnly(e.target.value)} placeholder="client.example, partner.example" />
              </Field>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={applyOnly} className="mb-[18px]">Apply</Button>
          </div>

          <label className="mt-2 flex items-start gap-2 text-13">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={includeRoles} onChange={(e) => setIncludeRoles(e.target.checked)} />
            <span>
              Include role addresses — noreply@, postmaster@, notifications@ and the like
              {analysis.roles.addresses > 0 && (
                <span className="block text-12-5 text-muted">
                  {analysis.roles.addresses.toLocaleString("en-IN")} found, for example {analysis.roles.sample.slice(0, 3).join(", ")}. Nobody reads those.
                </span>
              )}
            </span>
          </label>
        </section>

        <section>
          <h2 className="mb-1.5 text-13 font-semibold">Put them in</h2>
          {groups.length === 0 ? (
            <p className="measure text-13 text-muted">
              No groups yet. They will be imported without one —{" "}
              <Link href="/admin/newsletter/groups" className="font-semibold text-brand-ink underline">create a group</Link>{" "}
              first if you want to send to them as a set.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 text-13">
                  <input
                    type="checkbox"
                    checked={groupIds.includes(g.id)}
                    onChange={(e) => setGroupIds(e.target.checked ? [...groupIds, g.id] : groupIds.filter((id) => id !== g.id))}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="button" onClick={commit} disabled={busy || willImport === 0}>
            {busy ? "Importing…" : `Import ${willImport.toLocaleString("en-IN")} subscriber${willImport === 1 ? "" : "s"}`}
          </Button>
          <Button type="button" variant="secondary" onClick={discard} disabled={busy}>Discard this scan</Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- scanning
  if (step === "scanning" && scan) {
    const p = scan.progress ?? {};
    const total = p.messages_total ?? null;
    const done = p.messages ?? 0;
    const pct = total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <div className="rounded-lg border border-line-strong bg-card p-4">
          <p className="text-13-5 font-semibold text-ink">
            {scan.status === "pending" ? "Waiting for the queue to pick the scan up…" : `Reading ${p.folder ?? "the mailbox"}…`}
          </p>
          <p className="mt-0.5 text-12-5 text-muted">{scan.filename}</p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Messages read">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-(--duration-slow)" style={{ width: `${pct ?? 5}%` }} />
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-1 text-13 sm:grid-cols-2">
            <Count label="Folders" value={p.folders_done ?? 0} />
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">of</dt>
              <dd className="tabular-nums">{p.folders_total ?? "—"}</dd>
            </div>
            <Count label="Messages read" value={done} />
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">of</dt>
              <dd className="tabular-nums">{total === null ? "—" : total.toLocaleString("en-IN")}</dd>
            </div>
            <Count label="Addresses found" value={p.addresses ?? 0} strong />
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Started</dt>
              <dd>{p.started_at ? formatDate(p.started_at, "short") : "—"}</dd>
            </div>
          </dl>

          <p className="mt-3 text-12-5 text-muted">
            A large mailbox takes a while: the scan runs in short slices from the queue, and this page follows
            it. You can leave and come back — it carries on without the page.
          </p>
        </div>

        <div>
          <Button type="button" variant="secondary" size="sm" onClick={discard} disabled={busy}>Discard this scan</Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- source
  const failed = scan && (scan.status === "failed" || scan.status === "expired");
  const providerLabel = provider === "microsoft" ? "Microsoft" : "Google";

  return (
    <div className="grid gap-5">
      {failed && scan.status === "failed" && (
        <Alert tone="err" title="The last scan did not finish">
          {scan.error ?? "The mailbox refused the connection."} Nothing was imported — start it again.
        </Alert>
      )}
      {failed && scan.status === "expired" && (
        <Alert tone="warn" title="The last scan's result was not imported within a day and has been discarded" dismissible={false} />
      )}
      {error && <Alert tone="err" title="That did not work">{error}</Alert>}
      {notice.error && <Alert tone="err" title="That did not work">{notice.error}</Alert>}
      {notice.ok && <Alert tone="ok" title="Done">{notice.ok}</Alert>}
      {status.error && <Alert tone="warn" title="The mailbox refused the last consent" dismissible={false}>{status.error}</Alert>}

      {missingPhp.length > 0 && (
        <Alert tone="warn" title="PHP is missing an extension the mailbox reader needs" dismissible={false}>
          The IMAP library needs {missingPhp.map((n) => `ext-${n}`).join(", ")}, which this server does not have
          enabled. Enable it in php.ini and restart PHP, or the scan will fail at its first connection.
        </Alert>
      )}

      <DeliveryStatus queue={queue} subject="scan" />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-13 font-semibold">Which mailbox</legend>

        <label className={`grid gap-3 rounded-lg border p-4 ${source === "connected" ? "border-brand-ink/40 bg-brand-50" : "border-line-strong bg-card"}`}>
          <span className="flex items-start gap-2.5">
            <input type="radio" name="source" className="mt-0.5 accent-brand-600" checked={source === "connected"} onChange={() => setSource("connected")} />
            <span>
              <span className="block text-13-5 font-semibold text-ink">A Gmail, Google Workspace or Microsoft 365 mailbox</span>
              <span className="block text-12-5 text-muted">
                You sign in and approve access; the consent is used for this scan and forgotten when it finishes.
              </span>
            </span>
          </span>

          {source === "connected" && (
            <div className="grid gap-3 pl-6">
              {!status.client_configured && (
                <Alert tone="info" title="No OAuth client is saved yet" dismissible={false}>
                  An administrator saves the client ID and secret once under Tickets → Email to ticket; this screen only
                  adds its own callback address, <span className="font-mono text-12 [overflow-wrap:anywhere]">{status.callback_path}</span>, to that client.
                </Alert>
              )}
              <Field label="Provider" htmlFor="mailbox-provider" variant="float-static" className="mb-0 sm:max-w-[22rem]">
                <Select id="mailbox-provider" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={status.is_connected}>
                  {status.providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </Field>
              <MailboxConnection
                account={status.account}
                connectedAt={status.connected_at}
                isConnected={status.is_connected}
                providerLabel={providerLabel}
                busy={busy}
                onConnect={() => run(() => connectNewsletterMailboxAction(provider))}
                onDisconnect={() => run(disconnectNewsletterMailboxAction)}
                connectLabel={provider === "microsoft" ? "Connect a Microsoft 365 mailbox" : "Connect a Gmail mailbox"}
                disconnectWarning="The consent is forgotten; connect again to scan."
                hint={`Register ${status.callback_path} on this site's address as a redirect URI of the OAuth client saved under Tickets → Email to ticket, then connect. ${
                  provider === "microsoft"
                    ? "The app registration needs the delegated permissions IMAP.AccessAsUser.All, offline_access, openid and email, and IMAP switched on for the mailbox."
                    : "Only the Google account's IMAP access is asked for; nothing is sent as it."
                }`}
              />
            </div>
          )}
        </label>

        <label className={`grid gap-3 rounded-lg border p-4 ${source === "imap" ? "border-brand-ink/40 bg-brand-50" : "border-line-strong bg-card"}`}>
          <span className="flex items-start gap-2.5">
            <input type="radio" name="source" className="mt-0.5 accent-brand-600" checked={source === "imap"} onChange={() => setSource("imap")} />
            <span>
              <span className="block text-13-5 font-semibold text-ink">Another mailbox over IMAP</span>
              <span className="block text-12-5 text-muted">
                A hosting-provider mailbox, Zoho, Yahoo — anything with an IMAP server and a password. The details
                are used for this scan only and are not stored.
              </span>
            </span>
          </span>

          {source === "imap" && (
            <div className="grid gap-x-4 pl-6 sm:grid-cols-2">
              <Field label="IMAP host" htmlFor="imap-host">
                <Input id="imap-host" value={imap.host} onChange={(e) => setImap({ ...imap, host: e.target.value })} placeholder="imap.example.com" autoComplete="off" />
              </Field>
              <Field label="Port" htmlFor="imap-port">
                <Input id="imap-port" inputMode="numeric" value={imap.port} onChange={(e) => setImap({ ...imap, port: e.target.value })} placeholder="993" autoComplete="off" />
              </Field>
              <Field label="Encryption" htmlFor="imap-encryption" variant="float-static">
                <Select id="imap-encryption" value={imap.encryption} onChange={(e) => setImap({ ...imap, encryption: e.target.value })}>
                  {ENCRYPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Username" htmlFor="imap-username" hint="Usually the full email address.">
                <Input id="imap-username" value={imap.username} onChange={(e) => setImap({ ...imap, username: e.target.value })} placeholder="marketing@example.com" autoComplete="off" />
              </Field>
              <Field label="Password" htmlFor="imap-password">
                <Input id="imap-password" type="password" value={imap.password} onChange={(e) => setImap({ ...imap, password: e.target.value })} autoComplete="new-password" />
              </Field>
            </div>
          )}
        </label>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-13 font-semibold">Which messages</legend>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Dates" htmlFor="range-preset" variant="float-static">
            <Select id="range-preset" value={preset} onChange={(e) => choosePreset(e.target.value)}>
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="From" htmlFor="range-since">
            <Input id="range-since" type="date" value={preset === "all" ? "" : since} disabled={preset === "all"}
              onChange={(e) => { setSince(e.target.value); setPreset("custom"); }} />
          </Field>
          <Field label="To" htmlFor="range-until">
            <Input id="range-until" type="date" value={preset === "all" ? "" : until} disabled={preset === "all"}
              onChange={(e) => { setUntil(e.target.value); setPreset("custom"); }} />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-13">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={includeJunk} onChange={(e) => setIncludeJunk(e.target.checked)} />
          <span>
            Include Junk, Trash and Drafts
            <span className="block text-12-5 text-muted">
              Off by default: spam&apos;s recipients are harvested or forged, deleted mail was deleted on purpose, and a
              draft&apos;s recipients may never have been written to. Gmail&apos;s &ldquo;All Mail&rdquo; is never read — it is every
              message again.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="button" onClick={startScan}
          disabled={busy || (source === "connected" ? !status.is_connected : !(imap.host && imap.username && imap.password))}>
          {busy ? "Starting…" : "Scan mailbox"}
        </Button>
        <p className="measure text-12-5 text-muted">
          Reads only the address lines of each message — never the contents — and writes nothing until you have
          reviewed what it found.
        </p>
      </div>
    </div>
  );
}
