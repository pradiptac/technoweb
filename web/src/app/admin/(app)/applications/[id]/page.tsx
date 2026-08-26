import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/input";
import { getJobApplication } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminJobApplication } from "@/types/api";
import { ApplicationStatusBadge } from "../status-badge";
import { StatusForm } from "./status-form";

export const metadata = buildMetadata({ title: "Application", path: "/admin/applications", seo: noIndex });

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

const size = (bytes: number | null) =>
  bytes === null ? "" : bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

export default async function ApplicationPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;

  let application: AdminJobApplication;
  try {
    application = await getJobApplication(Number(id));
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={application.name}
        back={{ href: "/admin/applications", label: "All applications" }}
      >
        <span className="ml-auto">
          <ApplicationStatusBadge status={application.status} label={application.status_label} />
        </span>
      </PageHeader>

      {done === "status" && (
        <Alert tone="ok" title="Status saved">
          The candidate is not emailed by this — hiring conversations are had by a person.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="admin-title mb-3">Applied for</h2>
            <p className="text-[15px] font-medium text-ink">{application.job.title}</p>
            {application.job.exists && application.job.slug ? (
              <p className="mt-1 text-[13px]">
                <Link href={`/admin/jobs/${application.job.id}`} className="text-brand-ink hover:underline">
                  Open the vacancy
                </Link>
              </p>
            ) : (
              /* The title was copied onto the row when they applied, which is
                 why this still reads after the vacancy was deleted. */
              <p className="mt-1 text-[13px] text-faint">That vacancy has since been removed.</p>
            )}
          </Card>

          {application.cover_letter && (
            <Card className="p-4">
              <h2 className="admin-title mb-2">What they said</h2>
              <p className="whitespace-pre-line text-[14px] leading-[1.65] text-ink-2">
                {application.cover_letter}
              </p>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="admin-title mb-3">CV</h2>
            {application.cv ? (
              <>
                <p className="text-[14px] text-ink">
                  {application.cv.filename}{" "}
                  <span className="text-muted">({size(application.cv.size)})</span>
                </p>
                {/*
                  A plain link, not fetch: the file is streamed by an
                  authorised route and downloads as an attachment. It has no
                  public URL and no existence outside this session.
                */}
                <p className="mt-2">
                  <a
                    href={`/admin/applications/${application.id}/cv`}
                    className="inline-flex items-center gap-1.5 rounded border border-line-strong bg-card px-3 py-1.5 text-[13.5px] font-semibold text-brand-ink hover:border-brand-300"
                  >
                    Download CV
                  </a>
                </p>
                <p className="mt-2 text-[12px] text-faint">
                  Stored privately. Only signed-in staff can open it, and it is deleted with the
                  application.
                </p>
              </>
            ) : (
              <p className="text-[13.5px] text-muted">No CV was attached.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="admin-title mb-1">Candidate</h2>
            <dl>
              <Row label="Email">
                <a href={`mailto:${application.email}`} className="text-brand-ink hover:underline">
                  {application.email}
                </a>
              </Row>
              <Row label="Phone">
                {application.phone ? (
                  <a href={`tel:${application.phone.replace(/(?!^\+)[^\d]/g, "")}`} className="text-brand-ink hover:underline">
                    {application.phone}
                  </a>
                ) : "—"}
              </Row>
              <Row label="Currently at">{application.current_company ?? "—"}</Row>
              <Row label="Experience">
                {application.experience_years !== null ? `${application.experience_years} years` : "—"}
              </Row>
              <Row label="Portfolio">
                {application.portfolio_url ? (
                  <a
                    href={application.portfolio_url}
                    target="_blank"
                    /* An address a stranger supplied. `noopener` so the opened
                       page cannot reach back through window.opener. */
                    rel="noopener noreferrer nofollow"
                    className="text-brand-ink hover:underline"
                  >
                    Open
                  </a>
                ) : "—"}
              </Row>
              <Row label="Applied">{stamp(application.created_at)}</Row>
              <Row label="Last reviewed">{stamp(application.reviewed_at)}</Row>
              <Row label="Reviewed by">{application.reviewed_by || "—"}</Row>
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="admin-title mb-3">Move this along</h2>
            <StatusForm application={application} />
          </Card>
        </div>
      </div>
    </>
  );
}
