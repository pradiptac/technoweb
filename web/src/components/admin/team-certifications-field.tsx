"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminTeamMemberCertification } from "@/types/api";

const MAX = 20;

type Row = { name: string; issuer: string; credential_id: string; issued_on: string; expires_on: string };

const blank = (): Row => ({ name: "", issuer: "", credential_id: "", issued_on: "", expires_on: "" });

/**
 * A team member's certifications — a repeating list of name, issuer,
 * credential id and two dates.
 *
 * The `ResultsField` shape: rows held in state, serialised into **one hidden
 * JSON input** rather than indexed field names, and rows without a name
 * dropped before they are sent — a blank trailing row is a normal thing to
 * leave behind. The key is **always posted**, as `[]` when there is nothing,
 * because to the API an absent key means "leave them alone" and somebody who
 * removed their last certification would find it silently kept.
 */
export function TeamCertificationsField({
  defaultValue, error,
}: {
  defaultValue: AdminTeamMemberCertification[];
  error?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    defaultValue.length
      ? defaultValue.map((c) => ({
        name: c.name, issuer: c.issuer ?? "", credential_id: c.credential_id ?? "",
        issued_on: c.issued_on ?? "", expires_on: c.expires_on ?? "",
      }))
      : [blank()],
  );

  const update = (i: number, key: keyof Row, v: string) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, [key]: v } : row)));

  const complete = rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      issuer: r.issuer.trim() || null,
      credential_id: r.credential_id.trim() || null,
      issued_on: r.issued_on || null,
      expires_on: r.expires_on || null,
    }));

  return (
    <div className="mb-[18px]">
      <span className="mb-[7px] block text-13-5 font-semibold">Certifications</span>
      <p className="mb-3 text-12-5 text-faint">
        Shown as chips on the team card while they are in date; one past its expiry comes off the
        site by itself. The credential id is for your records and is never published.
      </p>

      <input type="hidden" name="certifications" value={JSON.stringify(complete)} />

      {error && <p className="mb-2 text-12-5 text-err">{error}</p>}

      <ul className="grid gap-3">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-line-strong bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto_auto]">
            <Input aria-label={`Certification ${i + 1} name`} placeholder="CCNA" value={row.name} onChange={(e) => update(i, "name", e.target.value)} />
            <Input aria-label={`Certification ${i + 1} issuer`} placeholder="Cisco" value={row.issuer} onChange={(e) => update(i, "issuer", e.target.value)} />
            <Input aria-label={`Certification ${i + 1} credential id`} placeholder="Credential id" value={row.credential_id} onChange={(e) => update(i, "credential_id", e.target.value)} className="font-mono" />
            <Input aria-label={`Certification ${i + 1} issued on`} type="date" value={row.issued_on} onChange={(e) => update(i, "issued_on", e.target.value)} />
            <Input aria-label={`Certification ${i + 1} expires on`} type="date" value={row.expires_on} onChange={(e) => update(i, "expires_on", e.target.value)} />
            <button
              type="button"
              onClick={() => setRows((r) => (r.length === 1 ? [blank()] : r.filter((_, n) => n !== i)))}
              aria-label={`Remove certification ${i + 1}`}
              className="rounded border border-line-strong bg-card px-3 py-[11px] text-13 font-semibold text-muted hover:border-faint hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {rows.length < MAX && (
        <Button type="button" variant="secondary" size="sm" className="mt-2.5" onClick={() => setRows((r) => [...r, blank()])}>
          Add certification
        </Button>
      )}
    </div>
  );
}
