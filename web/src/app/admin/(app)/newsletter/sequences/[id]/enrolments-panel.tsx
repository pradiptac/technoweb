"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Textarea, Alert } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconLayers } from "@/components/icons-ui";
import { formatDate } from "@/lib/dates";
import type { EnrolmentIndex } from "@/lib/admin";
import type { NewsletterGroup, NewsletterSequence } from "@/types/api";
import { cancelEnrolmentAction, enrolAction } from "../../actions";

const TONE = { active: "open", completed: "resolved", cancelled: "closed" } as const;

/**
 * Who is in the sequence, and enrolling more by hand.
 *
 * The count per status is the headline — active is people with messages to
 * come — and the list beneath is one page of them with a filter, because a
 * sequence that has run for a year holds thousands. Enrolling by hand takes
 * a group or pasted addresses; the addresses are resolved on the server
 * against the subscriber list, and the tally names what was refused, since
 * the refused ones are the interesting ones.
 */
export function EnrolmentsPanel({
  sequence, groups, enrolments, status,
}: {
  sequence: NewsletterSequence;
  groups: NewsletterGroup[];
  enrolments: EnrolmentIndex;
  status?: string;
}) {
  const counts = sequence.enrolments ?? { active: 0, completed: 0, cancelled: 0 };
  const [state, action, enrolling] = useActionState(enrolAction, {});
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const cancel = (enrolmentId: number) => {
    setMessage(null);
    start(async () => {
      const result = await cancelEnrolmentAction(sequence.id, enrolmentId);
      setMessage(result.error ? { tone: "err", text: result.error } : { tone: "ok", text: result.ok ?? "Cancelled." });
    });
  };

  return (
    <div className="grid gap-4">
      <dl className="grid gap-2.5 sm:grid-cols-3">
        {(["active", "completed", "cancelled"] as const).map((key) => (
          <div key={key} className="rounded-lg border border-line-strong bg-card p-3.5">
            <dt className="text-12 font-semibold uppercase tracking-[.04em] text-muted">{key}</dt>
            <dd className="mt-1 font-display text-24 font-semibold leading-none tabular-nums">{counts[key].toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      <section className="border-t border-line pt-3">
        <h2 className="mb-1 text-13 font-semibold">Enrol by hand</h2>
        <p className="measure mb-2 text-12-5 text-muted">
          Everybody active in a group, or addresses pasted one per line. Only active subscribers who
          are not on the do-not-mail list are enrolled, and nobody twice.
        </p>

        {state.error && <Alert tone="err" title="Not enrolled">{state.error}</Alert>}
        {state.ok && <Alert tone="ok" title={state.ok} />}

        <Form action={action} state={state} key={state.ok ?? "enrol"} className="grid gap-2.5 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <input type="hidden" name="id" value={sequence.id} />
          <Field label="A group" htmlFor="enrol-group" variant="float-static" className="mb-0">
            <Select id="enrol-group" name="group_id" defaultValue="">
              <option value="">None</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.active_count})</option>)}
            </Select>
          </Field>
          <Field label="Or addresses" htmlFor="enrol-emails" variant="float" className="mb-0">
            <Textarea id="enrol-emails" name="emails" rows={2} placeholder="one@example.in, two@example.in" />
          </Field>
          <Button type="submit" size="sm" pending={enrolling}>{enrolling ? "Enrolling…" : "Enrol"}</Button>
        </Form>
      </section>

      <section className="border-t border-line pt-3">
        {message && (
          <Alert tone={message.tone} title={message.tone === "ok" ? "Done" : "That did not work"}>{message.text}</Alert>
        )}

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-13 font-semibold">People</h2>
          <nav aria-label="Enrolment status" className="ml-auto flex gap-1">
            {[{ value: "", label: "All" }, ...enrolments.meta.statuses].map((s) => (
              <Link
                key={s.value}
                href={`/admin/newsletter/sequences/${sequence.id}?tab=enrolments${s.value ? `&status=${s.value}` : ""}`}
                aria-current={(status ?? "") === s.value ? "page" : undefined}
                className={`rounded px-2.5 py-1 text-12-5 ${(status ?? "") === s.value ? "bg-brand-50 font-semibold text-brand-ink" : "text-muted hover:bg-surface-2"}`}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>

        {enrolments.data.length === 0 ? (
          <EmptyState icon={<IconLayers />} title="Nobody here yet">
            People are enrolled as they join, or by hand above.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[640px] text-13">
              <thead>
                <tr className="border-b border-line text-left text-12 uppercase tracking-[.04em] text-muted">
                  <th className="py-2 pr-3 font-semibold">Subscriber</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Next</th>
                  <th className="py-2 pr-3 font-semibold">Enrolled</th>
                  <th className="py-2 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {enrolments.data.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td data-label="Subscriber" className="max-w-[36ch] truncate py-2 pr-3">
                      <span className="font-medium">{e.subscriber?.name ?? "—"}</span>
                      {e.subscriber && e.subscriber.name !== e.subscriber.email && (
                        <span className="block truncate font-mono text-11-5 text-faint">{e.subscriber.email}</span>
                      )}
                    </td>
                    <td data-label="Status" className="py-2 pr-3">
                      <Badge tone={TONE[e.status]}>{e.status_label}</Badge>
                      {e.cancelled_reason && <span className="ml-2 text-12 text-faint">{e.cancelled_reason}</span>}
                    </td>
                    <td data-label="Next" className="py-2 pr-3 text-muted">
                      {e.status === "active" && e.next_at
                        ? `Step ${e.next_position} on ${formatDate(e.next_at, "short")}`
                        : e.completed_at ? `Finished ${formatDate(e.completed_at, "short")}` : "—"}
                    </td>
                    <td data-label="Enrolled" className="py-2 pr-3 text-muted">{e.enrolled_at ? formatDate(e.enrolled_at, "short") : "—"}</td>
                    <td data-label="" className="py-2 text-right">
                      {e.status === "active" && (
                        <Button type="button" size="sm" variant="ghost" className="text-err" disabled={pending} onClick={() => cancel(e.id)}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          meta={enrolments.meta}
          basePath={`/admin/newsletter/sequences/${sequence.id}`}
          params={{ tab: "enrolments", status }}
        />
      </section>
    </div>
  );
}
