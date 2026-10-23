import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Sparkline } from "@/components/charts/sparkline";
import { IconKey } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import type { Paginated } from "@/types/api";
import type { ApiKeyDayCount, ApiKeyRequestRow } from "@/types/api-keys";

/**
 * What this key has asked for, newest first, with the last thirty days as a
 * shape above it.
 *
 * A server component. The sparkline is scaled to its own peak, so it answers
 * "steady or spiky", and the total beside it answers how many; a quiet key is
 * a flat line on the baseline rather than a missing chart.
 */
export function RequestLog({
  keyId, result, counts, status,
}: {
  keyId: number;
  result: Paginated<ApiKeyRequestRow>;
  counts: ApiKeyDayCount[];
  status?: string;
}) {
  const rows = result.data;
  const base = `/admin/api-keys/${keyId}`;
  const total = counts.reduce((n, d) => n + d.count, 0);

  return (
    <section aria-labelledby="requests-heading">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="requests-heading" className="text-13-5 font-semibold">Requests</h2>
        <span className="text-12-5 text-muted">Newest first.</span>
        <nav aria-label="Filter requests" className="ml-auto flex flex-wrap gap-1.5">
          {[["", "All"], ["ok", "Succeeded"], ["error", "Refused"]].map(([value, label]) => (
            <ButtonLink
              key={value}
              href={`${base}?tab=requests${value ? `&status=${value}` : ""}`}
              size="sm"
              variant={(status ?? "") === value ? "secondary" : "ghost"}
              aria-current={(status ?? "") === value ? "page" : undefined}
            >
              {label}
            </ButtonLink>
          ))}
        </nav>
      </div>

      <div className="mb-4 rounded-lg border border-line-strong bg-card p-3">
        <p className="mb-1 text-12-5 text-muted">
          <span className="text-15 font-semibold text-ink">{total}</span> {total === 1 ? "request" : "requests"} in the last 30 days
        </p>
        <Sparkline values={counts.map((d) => d.count)} className="h-12 w-full" />
        <p className="mt-1 flex justify-between text-11-5 text-faint">
          <span>{counts[0] ? formatDate(counts[0].date, "short") : ""}</span>
          <span>Today</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<IconKey />} title={status ? "No requests match that filter" : "Not used yet"}>
          {status
            ? "Nothing logged for this key with that outcome."
            : "Every call made with this key appears here, with the address it came from."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[720px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">When</th>
                <th scope="col" className="px-3 py-1.5">Request</th>
                <th scope="col" className="px-3 py-1.5">Result</th>
                <th scope="col" className="px-3 py-1.5">Address</th>
                <th scope="col" className="px-3 py-1.5">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="When" className="px-3 py-2 text-12-5 text-muted">{formatDate(r.created_at, "dateTime")}</td>
                  <td data-label="Request" className="px-3 py-2">
                    <span className="font-mono text-12-5 text-ink">
                      <span className="font-semibold">{r.method}</span> <span className="break-all">{r.path}</span>
                    </span>
                  </td>
                  <td data-label="Result" className="px-3 py-2">
                    <Badge tone={r.status < 400 ? "resolved" : "urgent"}>{r.status}</Badge>
                  </td>
                  <td data-label="Address" className="px-3 py-2 font-mono text-12-5 text-ink-2">{r.ip ?? "—"}</td>
                  <td data-label="Time" className="px-3 py-2 font-mono text-12-5 text-muted">
                    {r.duration_ms === null ? "—" : `${r.duration_ms} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath={base} params={{ tab: "requests", status }} />
    </section>
  );
}
