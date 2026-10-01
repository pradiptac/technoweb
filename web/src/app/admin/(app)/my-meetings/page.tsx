import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconMeeting } from "@/components/icons";
import { getMyMeetings } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { MeetingTable } from "../meetings/meeting-table";
import type { AdminMeetingIndex } from "@/types/meetings";

export const metadata = buildMetadata({ title: "My meetings", path: "/admin/my-meetings", seo: noIndex });

type SearchParams = {
  q?: string; status?: string; from?: string; to?: string; needs_outcome?: string;
  sort?: string; dir?: string; page?: string; per_page?: string;
};

/**
 * A host's own diary (`role:meeting_host`, scoped to them by the API): the
 * meetings they host, and the outcome and notes after each one. Somebody
 * who is also sales or support works the whole list at Meetings.
 */
export default async function MyMeetingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  let result: AdminMeetingIndex;
  try {
    result = await getMyMeetings({
      q: params.q, status: params.status, from: params.from, to: params.to,
      needs_outcome: params.needs_outcome === "1", sort: params.sort, dir: params.dir,
      page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load your meetings">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { meta } = result;
  const filtered = Boolean(params.q || params.status || params.from || params.to || params.needs_outcome);
  const listParams = {
    q: params.q, status: params.status, from: params.from, to: params.to, needs_outcome: params.needs_outcome,
    sort: params.sort, dir: params.dir, per_page: params.per_page,
  };

  return (
    <>
      <PageHeader
        title="My meetings"
        lede={<>
          The Google Meet calls you host. Join from the meeting, and record afterwards whether it happened and what
          came of it. Times are in {meta.timezone_label}.
        </>}
      />

      <FilterBar action="/admin/my-meetings">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Reference, name, company…" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={params.from} />
        </FilterField>
        <FilterField label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={params.to} />
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/my-meetings" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {meta.needs_outcome_count > 0 && params.needs_outcome !== "1" && (
        <p className="mb-3 text-13">
          <Link href="/admin/my-meetings?needs_outcome=1" className="font-semibold text-warn underline">
            {meta.needs_outcome_count} need an outcome
          </Link>
        </p>
      )}

      {result.data.length === 0 ? (
        <EmptyState icon={<IconMeeting />} title={filtered ? "Nothing matches those filters" : "No meetings yet"}>
          {filtered ? "Try a different term, or clear the filters." : "Meetings you are booked to host appear here."}
        </EmptyState>
      ) : (
        <MeetingTable
          meetings={result.data} meta={meta} basePath="/admin/my-meetings" params={listParams}
          sort={params.sort} dir={params.dir} showHost={false}
        />
      )}

      <Pagination meta={meta} basePath="/admin/my-meetings" params={listParams} />
    </>
  );
}
