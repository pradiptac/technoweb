"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Count } from "./count";
import type { NewsletterGroup, NewsletterImportReview } from "@/types/api";

export type ReviewDecision = { domains: string[]; includeRoles: boolean; groupIds: number[] };

/**
 * The review a scan ends on, shared by the mailbox scan and the website
 * crawl: the counts, the domain table (All / None / Suggested, and an "only
 * these domains" list that ticks exactly what it names), the role-address
 * switch, the groups, and the button that says how many will be added.
 *
 * It holds the reviewer's decisions itself, starting from the API's
 * per-domain verdicts, because it is mounted only once the scan is ready —
 * the starting ticks are the verdicts at that moment, not an effect on
 * derived state. `children` sits between the groups and the button: the
 * crawl's "put them in a group called …" tick and its sample rows.
 */
export function ImportReview({
  analysis, groups, busy, error, intro, discardLabel, rolesByDefault, rolesHint, onCommit, onDiscard, children,
}: {
  analysis: NewsletterImportReview;
  groups: NewsletterGroup[];
  busy: boolean;
  error: string | null;
  /** The alerts above the counts, which differ per source. */
  intro: ReactNode;
  discardLabel: string;
  rolesByDefault: boolean;
  rolesHint: string;
  onCommit: (decision: ReviewDecision) => void;
  onDiscard: () => void;
  children?: ReactNode;
}) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(analysis.domains.filter((d) => d.default).map((d) => d.domain)));
  const [includeRoles, setIncludeRoles] = useState(rolesByDefault);
  const [only, setOnly] = useState("");
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const counts = analysis.counts;

  const applyOnly = () => {
    const wanted = only.toLowerCase().split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean);
    if (wanted.length === 0) return;
    setTicked(new Set(analysis.domains
      .filter((d) => wanted.some((w) => d.domain === w || d.domain.endsWith("." + w)))
      .map((d) => d.domain)));
  };

  const willImport = useMemo(() => analysis.domains
    .filter((d) => ticked.has(d.domain))
    .reduce((n, d) => n + d.valid - (includeRoles ? 0 : d.role), 0), [analysis, ticked, includeRoles]);

  return (
    <div className="grid gap-5">
      {error && <Alert tone="err" title="That did not work">{error}</Alert>}

      {intro}

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
                {analysis.roles.addresses.toLocaleString("en-IN")} found, for example {analysis.roles.sample.slice(0, 3).join(", ")}. {rolesHint}
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

      {children}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button type="button" onClick={() => onCommit({ domains: Array.from(ticked), includeRoles, groupIds })} disabled={busy || willImport === 0}>
          {busy ? "Importing…" : `Import ${willImport.toLocaleString("en-IN")} subscriber${willImport === 1 ? "" : "s"}`}
        </Button>
        <Button type="button" variant="secondary" onClick={onDiscard} disabled={busy}>{discardLabel}</Button>
      </div>
    </div>
  );
}
