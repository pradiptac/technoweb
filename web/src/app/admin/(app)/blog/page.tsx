import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Alert } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconBook } from "@/components/icons";
import { getBlogPosts, getStaff, type BlogQueryParams } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminBlogPost, Paginated, PublishStatus, StaffUser } from "@/types/api";
import type { ReactNode } from "react";

export const metadata = buildMetadata({ title: "Blog", path: "/admin/blog", seo: noIndex });

const STATUS_OPTIONS: { value: PublishStatus; label: string }[] = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const statusTone = {
  published: "resolved",
  draft: "progress",
  archived: "closed",
} as const;

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-[150px]">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

type SearchParams = { status?: string; author_id?: string; q?: string; page?: string; deleted?: string };

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const queryParams: BlogQueryParams = {
    status: params.status as PublishStatus | undefined,
    author_id: params.author_id ? Number(params.author_id) : undefined,
    q: params.q,
    page: Number(params.page) || 1,
  };

  let result: Paginated<AdminBlogPost> | null = null;
  let staff: StaffUser[] = [];
  try {
    [result, staff] = await Promise.all([getBlogPosts(queryParams), getStaff()]);
  } catch {
    return (
      <ErrorState title="We could not load the posts">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const posts = result.data;
  const hasFilters = Boolean(params.status || params.author_id || params.q);
  const paginationParams: Record<string, string | undefined> = {
    status: params.status, author_id: params.author_id, q: params.q,
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Blog</h2>
        <div className="ml-auto">
          <ButtonLink href="/admin/blog/new" size="sm">New post</ButtonLink>
        </div>
      </div>

      {params.deleted && <Alert tone="ok" title="Post deleted">It is no longer on the site.</Alert>}

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-white p-4" action="/admin/blog">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Title or excerpt…" className="min-w-[220px]" />
        </FilterField>
        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Author" htmlFor="author_id">
          <Select id="author_id" name="author_id" defaultValue={params.author_id ?? ""}>
            <option value="">All</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && <ButtonLink href="/admin/blog" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </form>

      {posts.length === 0 ? (
        <EmptyState
          icon={<IconBook />}
          title={hasFilters ? "No posts match those filters" : "No posts yet"}
          action={hasFilters ? undefined : <ButtonLink href="/admin/blog/new" size="sm">Write the first one</ButtonLink>}
        >
          {hasFilters
            ? "Try a different combination, or clear the filters."
            : "Published posts appear on the public blog; drafts stay private until you publish them."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-white">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                <th scope="col" className="px-4 py-3">Post</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Author</th>
                <th scope="col" className="px-4 py-3">Published</th>
                <th scope="col" className="px-4 py-3">Read</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 align-top">
                  <td className="px-4 py-3.5">
                    <Link href={`/admin/blog/${p.id}`} className="block hover:underline">
                      <p className="max-w-[44ch] text-[14px] text-ink">{p.title}</p>
                    </Link>
                    <p className="mt-0.5 font-mono text-[12px] text-muted">/blog/{p.slug}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={statusTone[p.status]}>{p.status_label}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{p.author?.name ?? "—"}</td>
                  <td className="px-4 py-3.5 text-muted">
                    {p.published_at ? formatDate(p.published_at) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-muted">{p.reading_minutes ? `${p.reading_minutes} min` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/blog" params={paginationParams} />
    </>
  );
}
