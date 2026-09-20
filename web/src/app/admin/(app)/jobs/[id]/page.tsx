import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getJobExperienceLevels, getJobOpening, getJobQualifications } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { JobForm } from "../job-form";
import type { AdminJobOpening, JobExperienceLevelRow, JobQualificationRow } from "@/types/api";

export const metadata = buildMetadata({ title: "Vacancy", path: "/admin/jobs", seo: noIndex });

export default async function EditJobPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;

  let job: AdminJobOpening;
  let qualifications: JobQualificationRow[];
  let levels: JobExperienceLevelRow[];
  try {
    [job, qualifications, levels] = await Promise.all([
      getJobOpening(Number(id)),
      getJobQualifications(),
      getJobExperienceLevels(),
    ]);
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title={job.title} back={{ href: "/admin/jobs", label: "All vacancies" }}>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {job.application_count ? (
            <ButtonLink href={`/admin/applications?job=${job.id}`} variant="secondary" size="sm">
              {job.application_count} application{job.application_count === 1 ? "" : "s"}
            </ButtonLink>
          ) : null}
          {/*
            "Published" and "accepting applications" are different questions
            once a closing date exists, and this is the one screen that has to
            say which is true.
          */}
          <Badge tone={job.is_open ? "resolved" : "closed"}>
            {job.is_open ? "Open to applicants" : job.status === "published" ? "Past its closing date" : job.status}
          </Badge>
        </span>
      </PageHeader>

      <JobForm job={job} qualifications={qualifications} levels={levels} saved={done} />
    </>
  );
}
