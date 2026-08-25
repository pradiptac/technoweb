import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconMail } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { getForm, getFormSubmissions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { FormSubmission, Paginated, SiteForm } from "@/types/api";

export const metadata = buildMetadata({ title: "Submissions", path: "/admin/forms", seo: noIndex });

export default async function SubmissionsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; per_page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  let form: SiteForm;
  let rows: Paginated<FormSubmission>;
  try {
    [form, rows] = await Promise.all([
      getForm(Number(id)),
      getFormSubmissions(Number(id), {
        page: Number(sp.page) || 1,
        per_page: Number(sp.per_page) || undefined,
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <ErrorState title="We could not load the submissions">Try again shortly.</ErrorState>;
  }

  // The labels an editor set, so a submission reads the way the form did
  // rather than as its storage keys.
  const labels = new Map((form.fields ?? []).map((f) => [f.name, f.label]));

  return (
    <>
      <PageHeader
        back={{ href: `/admin/forms/${form.id}`, label: form.name }}
        title={`${form.name} submissions`}
        lede={<>Everything sent through this form, newest first. Deleting the form keeps these.</>}
      />

      {rows.data.length === 0 ? (
        <EmptyState icon={<IconMail />} title="Nothing submitted yet">
          Submissions appear here as soon as somebody uses the form.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {rows.data.map((row) => (
            <li key={row.id} className="rounded-lg border border-line-strong bg-white p-4">
              <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
                <span className="font-mono text-[12px] text-muted">#{row.id}</span>
                <time className="text-[12.5px] text-muted" dateTime={row.created_at}>
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  }).format(new Date(row.created_at))}
                </time>
                {row.ip_address && (
                  <span className="ml-auto font-mono text-[11.5px] text-faint">{row.ip_address}</span>
                )}
              </div>

              {/*
                Every value is rendered as text by React, never as markup. A
                submission is the one piece of content on this site written by
                an anonymous stranger, so escaping at the sink is the boundary
                — not sanitising on the way in.
              */}
              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,180px)_1fr]">
                {Object.entries(row.data).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-[13px] font-semibold text-muted">{labels.get(key) ?? key}</dt>
                    <dd className="text-[13.5px] whitespace-pre-wrap">
                      {typeof value === "boolean" ? (value ? "Yes" : "No") : (value ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        meta={rows.meta}
        basePath={`/admin/forms/${form.id}/submissions`}
        params={{ per_page: sp.per_page }}
      />
    </>
  );
}
