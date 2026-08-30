"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select, Alert } from "@/components/ui/input";
import { FileDrop } from "@/components/ui/file-drop";
import { analyseImportAction, runImportAction } from "../../actions";
import type { NewsletterGroup, NewsletterImportAnalysis } from "@/types/api";

/**
 * The five steps of the specification, as three screens.
 *
 * Choose, map, import — because only two of the five touch the server, and a
 * step that does nothing but say "next" is a step people click through without
 * reading. The mapping screen carries the validation summary and the group
 * choice, which is where somebody actually makes a decision.
 *
 * **The dry run writes nothing.** The counts here are what *would* happen, and
 * the alternative — import and report afterwards — means the moment somebody
 * discovers they mapped Company onto the surname column is the moment after
 * twelve hundred rows have been written. There is no undo for a mailing list.
 */

const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "email", label: "Email", hint: "Required. Rows without a valid one are skipped." },
  { key: "first_name", label: "First name", hint: "Used for {{first_name}} in a campaign." },
  { key: "last_name", label: "Last name" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
];

export function ImportWizard({ groups }: { groups: NewsletterGroup[] }) {
  const [analysis, setAnalysis] = useState<NewsletterImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const analyse = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    const result = await analyseImportAction(form);
    setBusy(false);

    if (result.error || !result.analysis) {
      setError(result.error ?? "That file could not be read.");
      return;
    }

    setAnalysis(result.analysis);
    setMapping(result.analysis.mapping);
  };

  const run = async () => {
    if (!analysis) return;

    setBusy(true);
    setError(null);

    const result = await runImportAction({
      file: analysis.file,
      original_name: analysis.original_name,
      mapping,
      group_ids: groupIds,
    });

    setBusy(false);

    if (result.error) setError(result.error);
    else setTally(result.tally ?? null);
  };

  // ---------------------------------------------------------------- done
  if (tally) {
    return (
      <div>
        <Alert tone="ok" title="Import finished">
          {tally.imported} added, {tally.updated} updated.
        </Alert>

        <dl className="mb-4 grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-[13px] sm:max-w-md">
          <Count label="Added" value={tally.imported} />
          <Count label="Already on the list" value={tally.duplicates} />
          <Count label="Updated with new detail" value={tally.updated} />
          <Count label="Not a valid address" value={tally.invalid} />
          {/*
            Reported rather than folded into "skipped". These are people who
            asked not to be contacted, and somebody should know the spreadsheet
            contained them — it usually means the list came from somewhere that
            has not been kept in step.
          */}
          <Count label="Previously unsubscribed" value={tally.suppressed} />
        </dl>

        <div className="flex gap-2">
          <ButtonLink href="/admin/newsletter/subscribers" size="sm">See the subscribers</ButtonLink>
          <Button type="button" size="sm" variant="secondary"
            onClick={() => { setTally(null); setAnalysis(null); }}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- mapping
  if (analysis) {
    const counts = analysis.counts;

    return (
      <div className="grid gap-4">
        {error && <Alert tone="err" title="That did not work">{error}</Alert>}

        <section>
          <h2 className="mb-1.5 text-[13px] font-semibold">
            {analysis.original_name}
            <span className="ml-2 font-normal text-faint">{counts.total} rows</span>
          </h2>

          <dl className="grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-[13px] sm:max-w-md">
            <Count label="Will be added" value={counts.valid} strong />
            <Count label="Already on the list" value={counts.already_subscribed} />
            <Count label="Repeated within the file" value={counts.duplicates} />
            <Count label="Not a valid address" value={counts.invalid} />
            <Count label="Previously unsubscribed" value={counts.suppressed} />
          </dl>

          <p className="measure mt-2 text-[12.5px] text-faint">
            Nothing has been written yet. These are the counts for the mapping below — change
            it and they change with it.
          </p>
        </section>

        <section>
          <h2 className="mb-1.5 text-[13px] font-semibold">Which column is which</h2>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`map-${field.key}`}
                variant="float-static" hint={field.hint}>
                <Select
                  id={`map-${field.key}`}
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping({
                    ...mapping,
                    [field.key]: e.target.value === "" ? null : Number(e.target.value),
                  })}
                >
                  <option value="">Not in this file</option>
                  {analysis.headers.map((header, i) => (
                    <option key={i} value={i}>{header || `Column ${i + 1}`}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </section>

        {analysis.preview.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-[13px] font-semibold">The first few rows, as mapped</h2>

            <div className="overflow-x-auto rounded-lg border border-line-strong">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-[11.5px] uppercase tracking-[.04em] text-muted">
                    {FIELDS.map((f) => <th key={f.key} className="px-3 py-1.5 font-semibold">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {analysis.preview.map((row, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {FIELDS.map((f) => (
                        <td key={f.key} className="max-w-[22ch] truncate px-3 py-1.5">
                          {row[f.key] ?? <span className="text-faint">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {analysis.problems.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-[13px] font-semibold">
              Rows that will be skipped
              <span className="ml-2 font-normal text-faint">first {analysis.problems.length}</span>
            </h2>

            <ul className="grid gap-1 text-[12.5px]">
              {analysis.problems.slice(0, 12).map((p, i) => (
                <li key={i} className="flex gap-2 rounded border border-line bg-surface px-3 py-1.5">
                  <span className="shrink-0 tabular-nums text-faint">Line {p.line}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{p.email ?? "—"}</span>
                  <span className="shrink-0 text-muted">{p.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-1.5 text-[13px] font-semibold">Put them in</h2>

          {groups.length === 0 ? (
            <p className="measure text-[13px] text-muted">
              No groups yet. They will be imported without one —{" "}
              <Link href="/admin/newsletter/groups" className="font-semibold text-brand-ink underline">
                create a group
              </Link>{" "}
              first if you want to send to them as a set.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={groupIds.includes(g.id)}
                    onChange={(e) => setGroupIds(e.target.checked
                      ? [...groupIds, g.id]
                      : groupIds.filter((id) => id !== g.id))}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="flex gap-2 border-t border-line pt-4">
          <Button type="button" onClick={run} disabled={busy || mapping.email === null || mapping.email === undefined}>
            {busy ? "Importing…" : `Import ${counts.valid} subscribers`}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAnalysis(null)} disabled={busy}>
            Choose a different file
          </Button>
        </div>

        {(mapping.email === null || mapping.email === undefined) && (
          <p className="text-[12.5px] text-warn">
            Choose which column holds the email address — without it there is nothing to import.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- choose
  return (
    <div>
      {error && <Alert tone="err" title="That file could not be read">{error}</Alert>}

      <FileDrop
        accept=".csv,text/csv"
        onFiles={analyse}
        label={busy ? "Reading…" : "Choose a CSV…"}
        hint="A header row, then one subscriber per line. Up to 10 MB."
      />

      <div className="measure mt-4 text-[13px] text-muted">
        <p className="mb-2">A file like this works:</p>
        <pre className="overflow-x-auto rounded border border-line bg-surface px-3 py-2 font-mono text-[12px]">
{`email,first_name,last_name,company
john@example.com,John,Doe,ABC Ltd
sarah@example.com,Sarah,Smith,XYZ Ltd`}
        </pre>
        <p className="mt-2">
          Column names do not have to match — the next step lets you say which is which.
          Semicolon-separated files and the ones Excel exports with a byte-order mark are read
          correctly too.
        </p>
      </div>
    </div>
  );
}

function Count({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-display text-[18px] font-semibold" : ""}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
