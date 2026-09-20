import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getJobExperienceLevels, getJobQualifications } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { QualificationList, LevelList } from "./reference-lists";
import type { JobExperienceLevelRow, JobQualificationRow } from "@/types/api";

export const metadata = buildMetadata({
  title: "Qualifications & experience", path: "/admin/jobs/reference", seo: noIndex,
});

/**
 * Both lookup lists on one screen.
 *
 * They are two tiny tables edited in the same sitting — while writing a
 * vacancy and finding the qualification missing — so two nav entries and two
 * screens would be chrome around four fields.
 */
export default async function JobReferencePage() {
  let qualifications: JobQualificationRow[];
  let levels: JobExperienceLevelRow[];
  try {
    [qualifications, levels] = await Promise.all([
      getJobQualifications(),
      getJobExperienceLevels(),
    ]);
  } catch {
    return (
      <ErrorState title="We could not load these lists">
        The admin API is not responding — try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Qualifications & experience"
        back={{ href: "/admin/jobs", label: "All vacancies" }}
        lede={<>
          The two lists a vacancy picks from. Neither can be deleted while a
          vacancy still uses it — the count says how many.
        </>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <QualificationList rows={qualifications} />
        <LevelList rows={levels} />
      </div>
    </>
  );
}
