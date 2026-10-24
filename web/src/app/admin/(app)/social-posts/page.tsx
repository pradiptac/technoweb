import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { getSocialPosts } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { SocialPostsTable } from "./social-posts-table";

export const metadata = buildMetadata({ title: "Social posts", path: "/admin/social-posts", seo: noIndex });

type Params = { status?: string; network?: string; page?: string; per_page?: string };

/**
 * LinkedIn and X drafts for published records (C7, docs/social-posts.md).
 * Waiting is the default view: the queue is what needs a person.
 */
export default async function SocialPostsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireScreen();
  const params = await searchParams;
  const status = params.status ?? "draft";

  let result;
  try {
    result = await getSocialPosts({
      status, network: params.network,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the social posts">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const filters = { status: params.status, network: params.network, per_page: params.per_page };
  const filtered = status !== "draft" || Boolean(params.network);

  return (
    <>
      <PageHeader
        title="Social posts"
        lede="Drafts are made when something is published. Nothing is posted until you approve it, and an approved X post opens in X, filled in, for you to post by hand."
      />

      <FilterBar action="/admin/social-posts">
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={status}>
            <option value="all">Any</option>
            {result.meta.statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}{s.value === "draft" ? ` (${result.meta.waiting})` : ""}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Network" htmlFor="network">
          <Select id="network" name="network" defaultValue={params.network ?? ""}>
            <option value="">Any</option>
            {result.meta.networks.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState illustration="document" title={filtered ? "No posts match that" : "Nothing is waiting"}>
          {filtered
            ? "Try another status or network."
            : "When a blog post, case study, event or press release is published, a LinkedIn draft and an X draft appear here for you to check. You can also draft one from the record's own screen."}
        </EmptyState>
      ) : (
        <>
          <SocialPostsTable posts={result.data} networks={result.meta.networks} />
          <Pagination meta={result.meta} basePath="/admin/social-posts" params={filters} />
        </>
      )}
    </>
  );
}
