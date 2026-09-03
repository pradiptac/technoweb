import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { getComments, type CommentList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ModerationList } from "./moderation-list";

export const metadata = buildMetadata({
  title: "Comments",
  path: "/admin/blog-comments",
  seo: noIndex,
});

type SearchParams = { status?: string; q?: string; page?: string; per_page?: string };

export default async function BlogCommentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  let result: CommentList;

  try {
    result = await getComments({
      status: params.status,
      q: params.q,
      page: Number(params.page) || 1,
      /*
       * Read here, passed to the getter, and repeated in the pager's own
       * params. All three or none: a screen that reads it but does not put it
       * back on the links forgets the choice on page two, which is the rule
       * `Pagination` states.
       */
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return <ErrorState title="We could not load the queue">The admin API is not responding.</ErrorState>;
  }

  const filtered = Boolean(params.status || params.q);

  return (
    <>
      <PageHeader
        title="Comments"
        lede={<>
          Nothing appears on the blog until somebody here says so — including comments from
          customers with an account. Nothing is filed as spam automatically either: a junk
          comment scores low and waits, because auto-filing eventually hides a real reader
          whose comment was three words.
        </>}
      >
        {result.meta.waiting > 0 && (
          <span className="ml-auto text-[13px] font-semibold">
            {result.meta.waiting} waiting
          </span>
        )}
      </PageHeader>

      <FilterBar action="/admin/blog-comments">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Text, name or address…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          {/*
            The blank option is "Waiting", not "Everything". This screen exists
            to be emptied, and opening on every comment ever posted would bury
            the handful needing a decision under a year of published ones —
            the argument `/admin/seo`'s `?issues=1` makes.
          */}
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Waiting</option>
            {result.meta.statuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </FilterField>

        <Button type="submit">Filter</Button>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches that" : "Nothing is waiting"}>
          {filtered
            ? "No comment matches that filter."
            : "Every comment has been dealt with. New ones arrive here and stay unpublished until you approve them."}
        </EmptyState>
      ) : (
        <ModerationList comments={result.data} />
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/blog-comments"
        params={{ status: params.status, q: params.q, per_page: params.per_page }}
      />
    </>
  );
}
