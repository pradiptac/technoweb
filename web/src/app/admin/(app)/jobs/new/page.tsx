import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getJobExperienceLevels, getJobQualifications } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { JobForm } from "../job-form";
import type { JobExperienceLevelRow, JobQualificationRow } from "@/types/api";

export const metadata = buildMetadata({ title: "New vacancy", path: "/admin/jobs/new", seo: noIndex });

export default async function NewJobPage() {
  // Fetched inside the try, rendered outside it. JSX built in a try block does
  // not catch its own render errors -- React renders it later — so the catch
  // would be quietly lying about what it protects.
  let qualifications: JobQualificationRow[];
  let levels: JobExperienceLevelRow[];
  try {
    [qualifications, levels] = await Promise.all([
      getJobQualifications(),
      getJobExperienceLevels(),
    ]);
  } catch {
    return <ErrorState title="We could not load the form">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader title="New vacancy" back={{ href: "/admin/jobs", label: "All vacancies" }} />
      <JobForm qualifications={qualifications} levels={levels} />
    </>
  );
}
