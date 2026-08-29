import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconClock } from "@/components/icons";
import { getActivity } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { ActivityEntry, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Activity", path: "/admin/activity", seo: noIndex });

type SearchParams = { action?: string; q?: string; page?: string; per_page?: string };

/**
 * Actions worth calling out in the row, and how.
 *
 * Only the ones that destroy or grant something. Colouring every action would
 * make the destructive ones no easier to find, which is the one job this
 * screen has when somebody is scanning it in a hurry.
 */
const ACTION_TONE: Record<string, "urgent" | "progress" | "open"> = {
  destroy: "urgent",
  login_failed: "urgent",
  reject: "urgent",
  approve: "progress",
  status: "progress",
  store: "open",
  login: "open",
  logout: "open",
};

const WORDING: Record<string, string> = {
  store: "created",
  update: "updated",
  destroy: "deleted",
  login: "signed in",
  logout: "signed out",
  login_failed: "failed sign-in",
  // Recorded for every address a code is asked for, including ones with no
  // staff account — which is what makes a run of these worth reading.
  login_code_requested: "asked for a sign-in code",
  approve: "approved",
  reject: "rejected",
  status: "changed status",
  "resend-verification": "resent verification",
  "clear-secret": "cleared a credential",
  sitemap: "changed sitemap flag",
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: Paginated<ActivityEntry> & { meta: { retention_days: number; actions: string[] } };
  try {
    result = await getActivity({
      action: params.action,
      q: params.q,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the activity log">
        This screen is administrator-only. If that is your account, the admin
        API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const rows = result.data;
  const filtered = Boolean(params.q || params.action);

  return (
    <>
      <PageHeader
        title="Activity"
        lede={<>
          Who did what, on the things where that question gets asked — accounts,
          settings, sign-ins, and anything created or deleted. Routine content
          edits are deliberately not here; the CMS already keeps those.
          {/*
            Said on the screen, so an empty stretch reads as policy rather than
            as a gap in the record.
          */}
          {" "}Entries are kept for <strong>{result.meta.retention_days} days</strong>,
          then deleted automatically.
        </>}
      />

      <FilterBar action="/admin/activity">
        <div className="min-w-0">
          <label htmlFor="q" className="mb-0.5 block text-[11px] font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q} placeholder="Person, address or record…" className="min-w-[210px] py-1.5 text-[13px]" />
        </div>
        <div>
          <label htmlFor="action" className="mb-0.5 block text-[11px] font-semibold text-faint">Action</label>
          <Select id="action" name="action" defaultValue={params.action ?? ""}>
            <option value="">Any action</option>
            {result.meta.actions.map((a) => (
              <option key={a} value={a}>{WORDING[a] ?? a}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/activity" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState icon={<IconClock />} title={filtered ? "Nothing matches those filters" : "Nothing recorded yet"}>
          {filtered
            ? "Try a different term, or clear the filters."
            : "Sign-ins and changes to accounts, settings and records will appear here."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-[10.5px] font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">When</th>
                <th scope="col" className="px-3 py-1.5">Who</th>
                <th scope="col" className="px-3 py-1.5">Did</th>
                <th scope="col" className="px-3 py-1.5">To</th>
                <th scope="col" className="px-3 py-1.5">From</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="When" className="px-3 py-2 whitespace-nowrap text-[12.5px] text-muted">
                    {stamp(r.created_at)}
                  </td>
                  <td data-label="Who" className="px-3 py-2">
                    <span className="text-[13.5px] font-medium text-ink">{r.actor.name}</span>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {r.actor.email}
                      {/*
                        The account is gone but the line remains — that is the
                        whole reason the name and address are copied in rather
                        than joined.
                      */}
                      {!r.actor.exists && <span className="ml-1.5 text-faint">(account removed)</span>}
                    </p>
                  </td>
                  <td data-label="Did" className="px-3 py-2">
                    {ACTION_TONE[r.action]
                      ? <Badge tone={ACTION_TONE[r.action]}>{WORDING[r.action] ?? r.action}</Badge>
                      : <span className="text-muted">{WORDING[r.action] ?? r.action}</span>}
                    {r.context && (
                      <p className="mt-1 font-mono text-[11.5px] text-faint">
                        {Object.entries(r.context)
                          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </td>
                  <td data-label="To" className="px-3 py-2">
                    {r.subject ? (
                      <>
                        <span className="text-ink">{r.subject.label ?? `#${r.subject.id}`}</span>
                        <p className="mt-0.5 text-[12px] text-faint">{r.subject.type.replace(/_/g, " ")}</p>
                      </>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td data-label="From" className="px-3 py-2 font-mono text-[12px] text-muted">
                    {r.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/activity"
        params={{ q: params.q, action: params.action, per_page: params.per_page }}
      />
    </>
  );
}
