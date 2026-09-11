import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { getMailTemplates } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { MailTemplateIndex, MailTemplateRow } from "@/types/api";

export const metadata = buildMetadata({
  title: "Email templates",
  path: "/admin/settings/email-templates",
  seo: noIndex,
});

/** Grouped, because a receipt and a desk alert are written differently. */
const GROUPS: { id: string; title: string; blurb: string }[] = [
  {
    id: "customer",
    title: "To customers",
    blurb: "Receipts, confirmations and account messages. These are the ones people keep.",
  },
  {
    id: "internal",
    title: "To the team",
    blurb: "Alerts to the support, sales and careers inboxes. Nobody outside the business sees these.",
  },
];

function when(row: MailTemplateRow): string {
  if (! row.updated_at) return "—";

  const date = new Date(row.updated_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return row.updated_by ? `${date} · ${row.updated_by}` : date;
}

export default async function EmailTemplatesPage() {
  let result: MailTemplateIndex;

  try {
    result = await getMailTemplates();
  } catch {
    return (
      <ErrorState title="We could not load the email templates">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const customised = result.data.filter((r) => r.is_customised).length;

  return (
    <>
      <PageHeader
        title="Email templates"
        back={{ href: "/admin/settings", label: "Settings" }}
        lede={<>
          Every email the system sends. Each one has wording built in, so there is nothing
          you have to write — open one only when you want to say it differently. The logo,
          colours and footer around them come from{" "}
          <Link href="/admin/settings" className="text-brand-ink hover:underline">Settings</Link>.
        </>}
      >
        <div className="ml-auto text-[13px] text-muted">
          {customised === 0
            ? "None customised"
            : `${customised} of ${result.data.length} customised`}
        </div>
      </PageHeader>

      {GROUPS.map((group) => {
        const rows = result.data.filter((r) => r.audience === group.id);

        if (rows.length === 0) return null;

        return (
          <section key={group.id} className="mb-8">
            <h2 className="admin-title mb-1 text-[17px]">{group.title}</h2>
            <p className="measure mb-3 text-[13px] text-muted">{group.blurb}</p>

            <div className="overflow-x-auto">
              <table className="admin-table w-full min-w-[620px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line-strong text-left text-[11.5px] uppercase tracking-[.06em] text-faint">
                    <th className="py-2.5 font-semibold">Message</th>
                    <th className="py-2.5 font-semibold">Wording</th>
                    <th className="py-2.5 font-semibold">Last edited</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-line last:border-b-0">
                      {/* Every `td` carries a `data-label`: below 48rem these
                          rows become cards, and an unlabelled cell is the one
                          nobody can read on a phone. */}
                      <td data-label="Message" className="py-2.5">
                        <Link
                          href={`/admin/settings/email-templates/${row.key}`}
                          className="font-semibold text-brand-ink hover:underline"
                        >
                          {row.label}
                        </Link>
                        <p className="mt-0.5 max-w-[52ch] text-[12.5px] text-muted">{row.description}</p>
                      </td>
                      <td data-label="Wording" className="py-2.5">
                        {!row.is_customised
                          ? <Badge tone="progress">Built in</Badge>
                          : row.is_enabled
                            ? <Badge tone="resolved">Customised</Badge>
                            // Customised *and* switched off: the copy is kept
                            // and the built-in message is what goes out, which
                            // is a third state and not the same as either.
                            : <Badge tone="open">Customised, off</Badge>}
                      </td>
                      <td data-label="Last edited" className="py-2.5 text-muted">{when(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
