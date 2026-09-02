import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { getChatUnanswered } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ResolveButton } from "./resolve-button";

export const metadata = buildMetadata({
  title: "Questions the site could not answer",
  path: "/admin/chat/unanswered",
  seo: noIndex,
});

/**
 * The most useful screen in the module.
 *
 * §42: the chatbot is not an SEO mechanism, but its failures are. Every line
 * here is a question somebody actually asked that the website does not answer —
 * which is a page, an FAQ or a knowledge article worth writing, in the visitor's
 * own words rather than a keyword tool's.
 *
 * Grouped, because a question forty people asked is one piece of work. An
 * ungrouped list is one where the most important item is the hardest to see.
 */
export default async function UnansweredPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { all } = await searchParams;
  const rows = await getChatUnanswered({ all: all === "1" }).catch(() => null);

  if (!rows) {
    return (
      <ErrorState title="We could not load the list">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Questions it could not answer"
        lede="The assistant answers only from what this website says, and says so plainly when the website does not say it. Each of these is somebody's own words for something the site does not cover — which is what to write next."
        back={{ href: "/admin/chat", label: "Website assistant" }}
      >
        <Link
          href={all === "1" ? "/admin/chat/unanswered" : "/admin/chat/unanswered?all=1"}
          className="ml-auto rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          {all === "1" ? "Hide resolved" : "Show resolved"}
        </Link>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title="Nothing outstanding">
          Every question the assistant could not answer has been dealt with — or nobody has
          asked one yet.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] text-faint">
                <th className="py-2 pr-3 pl-4 font-semibold">What they asked</th>
                <th className="py-2 pr-3 text-right font-semibold">Times</th>
                <th className="py-2 pr-3 font-semibold">Last asked</th>
                <th className="py-2 pr-4 font-semibold">Handled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ids[0]} className="border-b border-line last:border-0">
                  <td data-label="What they asked" className="max-w-[52ch] py-2 pr-3 pl-4">
                    {row.conversation_id ? (
                      <Link href={`/admin/chat/conversations/${row.conversation_id}`} className="hover:text-brand-ink">
                        {row.question}
                      </Link>
                    ) : (
                      row.question
                    )}
                  </td>
                  <td data-label="Times" className="py-2 pr-3 text-right font-medium tabular-nums">
                    {row.asked}
                  </td>
                  <td data-label="Last asked" className="py-2 pr-3 whitespace-nowrap text-muted">
                    {row.last_asked
                      ? new Date(row.last_asked).toLocaleDateString("en-IN", { dateStyle: "medium" })
                      : "—"}
                  </td>
                  <td data-label="Handled" className="py-2 pr-4">
                    {row.resolved ? (
                      <span className="text-[12.5px] text-muted">Done</span>
                    ) : (
                      <ResolveButton ids={row.ids} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
