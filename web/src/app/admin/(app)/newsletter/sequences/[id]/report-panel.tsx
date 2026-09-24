import Link from "next/link";
import { EmptyState } from "@/components/ui/empty";
import { IconLayers } from "@/components/icons";
import type { NewsletterSequenceReport } from "@/types/api";

/**
 * Per step: sent, opened, clicked, off the step campaign's recipient rows —
 * the same three expressions the subject-test table uses. Rates are worked
 * out here from the counts with the denominator beside them, as everywhere
 * else in the module; a step nobody has reached yet shows a dash rather
 * than 0%, because nothing has been measured.
 */
export function ReportPanel({ report }: { report: NewsletterSequenceReport }) {
  if (report.steps.length === 0) {
    return (
      <EmptyState icon={<IconLayers />} title="Nothing to report yet">
        Add steps and switch the sequence on; the figures fill in as people reach each one.
      </EmptyState>
    );
  }

  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

  return (
    <div className="overflow-x-auto">
      <table className="admin-table w-full min-w-[560px] text-13">
        <thead>
          <tr className="border-b border-line text-left text-12 uppercase tracking-[.04em] text-muted">
            <th className="py-2 pr-3 font-semibold">Step</th>
            <th className="py-2 pr-3 font-semibold">Sent</th>
            <th className="py-2 pr-3 font-semibold">Opened</th>
            <th className="py-2 font-semibold">Clicked</th>
          </tr>
        </thead>
        <tbody>
          {report.steps.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td data-label="Step" className="py-2 pr-3">
                <span className="mr-2 font-mono text-12 text-muted">{s.position}</span>
                <Link href={`/admin/newsletter/campaigns/${s.id}/report`} className="font-medium hover:underline">{s.subject}</Link>
                <span className="block text-12 text-faint">{s.delay_days === 0 ? "Straight away" : `${s.delay_days} day${s.delay_days === 1 ? "" : "s"} after the previous`}</span>
              </td>
              <td data-label="Sent" className="py-2 pr-3 tabular-nums">{s.sent.toLocaleString()}</td>
              <td data-label="Opened" className="py-2 pr-3 tabular-nums">{s.opened.toLocaleString()} <span className="text-faint">{pct(s.opened, s.sent)}</span></td>
              <td data-label="Clicked" className="py-2 tabular-nums">{s.clicked.toLocaleString()} <span className="text-faint">{pct(s.clicked, s.sent)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-11-5 text-faint">
        Rates are over sent. A step&rsquo;s own report has its links and timeline.
      </p>
    </div>
  );
}
