"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTableDate } from "@/lib/dates";
import type { SocialNetworkInfo, SocialPost } from "@/types/social-posts";
import { EDITABLE, ReviewPanel } from "./review-panel";
import { statusTone } from "./social-tones";

/**
 * The review list (C7): a row per draft, and the panel that opens on one.
 *
 * The panel is kept open from a snapshot of the row it was opened on, because
 * approving moves the post out of the Waiting list the page is showing — the
 * refreshed list no longer holds it, and the panel still has to say what
 * happened. Outcomes are announced through `?done=` like every other console
 * screen, so the toast bridge words them.
 */
export function SocialPostsTable({ posts, networks }: { posts: SocialPost[]; networks: SocialNetworkInfo[] }) {
  const [open, setOpen] = useState<SocialPost | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const announce = useCallback((key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("done", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="admin-table w-full min-w-[820px] text-13-5">
          <thead>
            <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
              <th className="py-2.5 font-semibold">Post</th>
              <th className="py-2.5 font-semibold">Network</th>
              <th className="py-2.5 font-semibold">Wording</th>
              <th className="py-2.5 font-semibold">Status</th>
              <th className="py-2.5 font-semibold">Drafted</th>
              <th className="py-2.5 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-line last:border-b-0">
                <td data-label="Post" className="max-w-[34ch] py-2.5 pr-4">
                  {post.subject ? (
                    <>
                      <Link href={post.subject.admin_path} className="block truncate font-semibold text-brand-ink hover:underline">
                        {post.subject.title}
                      </Link>
                      <span className="mt-0.5 block text-12 text-muted">{post.subject.kind}</span>
                    </>
                  ) : (
                    <span className="text-muted">The page has been deleted</span>
                  )}
                </td>
                <td data-label="Network" className="py-2.5 pr-4">{post.network_label}</td>
                <td data-label="Wording" className="max-w-[44ch] py-2.5 pr-4">
                  <span className="block truncate" title={post.text}>{post.text}</span>
                </td>
                <td data-label="Status" className="py-2.5">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Badge tone={statusTone[post.status]}>{post.status_label}</Badge>
                    {post.ai_pending && <Badge tone="accent" dot={false}>Writing…</Badge>}
                  </span>
                  {post.status === "failed" && post.error && (
                    <span className="mt-0.5 block max-w-[30ch] truncate text-12 text-muted" title={post.error}>{post.error}</span>
                  )}
                </td>
                <td data-label="Drafted" className="py-2.5">
                  <span title={post.created_at ?? undefined}>{formatTableDate(post.created_at)}</span>
                  <span className="mt-0.5 block text-12 text-muted">{post.drafted_by ?? "Automatic"}</span>
                </td>
                <td data-label="Actions" className="py-2.5 sm:text-right">
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                    {post.remote_url && (
                      <a href={post.remote_url} target="_blank" rel="noopener" className="py-1 text-12-5 font-semibold text-brand-ink hover:underline">
                        View post<span className="sr-only"> on {post.network_label}</span>
                      </a>
                    )}
                    <Button type="button" size="sm" variant={EDITABLE.includes(post.status) ? "primary" : "secondary"} onClick={() => setOpen(post)}>
                      {EDITABLE.includes(post.status) ? "Review" : "Open"}
                      <span className="sr-only"> the {post.network_label} post{post.subject ? ` for ${post.subject.title}` : ""}</span>
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <ReviewPanel
          key={open.id}
          post={posts.find((p) => p.id === open.id) ?? open}
          connected={networks.find((n) => n.value === open.network)?.connected ?? false}
          onClose={close}
          announce={announce}
        />
      )}
    </>
  );
}
