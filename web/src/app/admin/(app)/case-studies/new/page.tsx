import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getIndustries } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CaseStudyForm } from "../case-study-form";
import type { AdminIndustry } from "@/types/api";

export const metadata = buildMetadata({ title: "New case study", path: "/admin/case-studies/new", seo: noIndex });

export default async function NewCaseStudyPage() {
  let industries: AdminIndustry[] = [];
  try {
    industries = await getIndustries();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/case-studies", label: "All case studies" }}
        title="New case study"
      />

      <CaseStudyForm industries={industries} />
    </>
  );
}
