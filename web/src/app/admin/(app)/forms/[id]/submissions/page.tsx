import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconMail } from "@/components/icons";
import { IconDownload } from "@/components/icons-ui";
import { ApiError } from "@/lib/api";
import {
  getFormSubmissions, getFormWithMeta,
  type AdminForm, type AdminFormField, type AdminFormSubmission, type FormMeta, type FormSubmissionValue,
} from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { formatBytes } from "@/lib/format-bytes";
import type { Paginated } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";
import { isFileKind, isLayoutKind, kindsFrom } from "../../form-kinds";
import { DeleteSubmission } from "./delete-submission";

export const metadata = buildMetadata({ title: "Submissions", path: "/admin/forms", seo: noIndex });

type Upload = { name: string; size: number };

export default async function SubmissionsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  let form: AdminForm;
  let meta: FormMeta;
  let rows: Paginated<AdminFormSubmission>;
  try {
    [{ form, meta }, rows] = await Promise.all([
      getFormWithMeta(Number(id)),
      getFormSubmissions(Number(id), { page, per_page: Number(sp.per_page) || undefined }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <ErrorState title="We could not load the submissions">Try again shortly.</ErrorState>;
  }

  const kinds = kindsFrom(meta);
  // The questions, in the order the form asks them. A heading and a step
  // break are named by the API too, but nobody answers one.
  const questions = (form.fields ?? []).filter((f) => !isLayoutKind(kinds, f.kind));
  const declared = new Set(questions.map((f) => f.name));

  /** PHP sends an empty map as `[]`; anything that is not a map of uploads is none. */
  const uploads = (row: AdminFormSubmission): Record<string, Upload> =>
    row.files && !Array.isArray(row.files) ? row.files : {};

  /**
   * A submission in the order the form asks the questions.
   *
   * `data` is stored in the order the browser serialised the payload, which is
   * close to field order but not it — a submission read back with "How can we
   * help?" above "Subject" is a form nobody designed. Walking the fields and
   * looking values up fixes the order and applies the labels in one pass.
   *
   * A question with no entry is left out rather than shown blank: a field its
   * condition hid was never asked. Keys the form no longer declares are
   * appended rather than dropped — a renamed field would otherwise make every
   * answer collected under the old name silently disappear from a record of
   * what somebody actually sent — and so is a file under a name that has gone.
   */
  const ordered = (row: AdminFormSubmission) => {
    const files = uploads(row);
    const known = questions
      .filter((f) => f.name in row.data || f.name in files)
      .map((f) => ({ key: f.name, label: f.label, field: f as AdminFormField | null, value: row.data[f.name], file: files[f.name] }));
    const rest = [...new Set([...Object.keys(row.data), ...Object.keys(files)])]
      .filter((key) => !declared.has(key))
      .map((key) => ({ key, label: key, field: null as AdminFormField | null, value: row.data[key], file: files[key] }));

    return [...known, ...rest];
  };

  return (
    <>
      <PageHeader
        back={{ href: `/admin/forms/${form.id}`, label: form.name }}
        title={`${form.name} submissions`}
        lede={<>
          Everything sent through this form, newest first. Deleting the form keeps these;
          deleting one here removes it and any files sent with it, for good.
        </>}
      >
        {rows.data.length > 0 && (
          /*
            A plain `<a download>`, never a `Link`: a link to a route handler
            is prefetched, and this one builds the whole file each time.
          */
          <a
            href={`/api/admin/forms/${form.id}/submissions/export`}
            download
            className="ml-auto inline-flex items-center gap-1.5 rounded border border-line-strong bg-card px-3 py-2 text-13 font-semibold text-ink hover:bg-surface-2"
          >
            <IconDownload className="size-4" aria-hidden="true" />
            Export CSV
          </a>
        )}
      </PageHeader>

      {rows.data.length === 0 ? (
        <EmptyState icon={<IconMail />} title="Nothing submitted yet">
          Submissions appear here as soon as somebody uses the form.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {rows.data.map((row) => (
            <li key={row.id} className="min-w-0 rounded-lg border border-line-strong bg-card p-4">
              <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2">
                <span className="font-mono text-12 text-muted">#{row.id}</span>
                <time className="text-12-5 text-muted" dateTime={row.created_at}>
                  {formatDate(row.created_at, "dateTime")}
                </time>
                {row.ip_address && (
                  <span className="font-mono text-11-5 text-faint">{row.ip_address}</span>
                )}
                <DeleteSubmission
                  formId={form.id} submissionId={row.id} page={page} perPage={sp.per_page}
                  files={Object.keys(uploads(row)).length}
                />
              </div>

              {/*
                Every value is rendered as text by React, never as markup. A
                submission is the one piece of content on this site written by
                an anonymous stranger, so escaping at the sink is the boundary
                — not sanitising on the way in. A file is a link to the
                console's own route handler, which streams it as a download:
                never an address on the API, and never opened in the page.
              */}
              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,180px)_1fr]">
                {ordered(row).map((entry) => (
                  <div key={entry.key} className="contents">
                    <dt className="text-13 font-semibold text-muted [overflow-wrap:anywhere]">{entry.label}</dt>
                    <dd className="min-w-0 text-13-5 whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {entry.file ? (
                        <a
                          href={`/api/admin/forms/${form.id}/submissions/${row.id}/files/${encodeURIComponent(entry.key)}`}
                          download
                          className="inline-flex items-center gap-1.5 py-0.5 font-semibold text-brand-ink hover:underline"
                        >
                          <IconDownload className="size-4 shrink-0" aria-hidden="true" />
                          <span>{entry.file.name}</span>
                          <span className="font-normal text-muted">({formatBytes(entry.file.size)})</span>
                        </a>
                      ) : entry.field && isFileKind(kinds, entry.field.kind) ? (
                        /*
                          An upload field whose answer is a name and nothing
                          more: the submission remembers what was sent, and the
                          file itself is no longer held. Said, rather than
                          drawn as a link that would answer 404.
                        */
                        <>
                          {answer(entry.field, entry.value)}
                          {entry.value ? <span className="text-muted"> — the file is no longer stored</span> : null}
                        </>
                      ) : (
                        answer(entry.field, entry.value)
                      )}
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

/**
 * One answer as a person reads it.
 *
 * A submission stores an option's **value** (`network_audit`); the reader
 * wants the label the visitor ticked ("Network audit"), so a choice is looked
 * up in the field's own options and falls back to the stored value when the
 * option has since been removed. Several ticked boxes are joined, a rating
 * says what it is out of, and a single tick box is Yes or No.
 */
function answer(field: AdminFormField | null, value: FormSubmissionValue | undefined): string {
  const labelOf = (v: string) => field?.options?.find((o) => o.value === v)?.label ?? v;

  if (Array.isArray(value)) {
    return value.length ? value.map((v) => labelOf(String(v))).join(", ") : "—";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";

  if (field?.kind === "checkbox") {
    return value === 1 || value === "1" || value === "on" || value === "true" ? "Yes"
      : value === 0 || value === "0" || value === "false" ? "No" : String(value);
  }
  if (field?.kind === "rating") return `${value} / 5`;

  return labelOf(String(value));
}
