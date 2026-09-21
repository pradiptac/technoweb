import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getAnswerBlockKinds, getSolutionOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import type { AnswerBlockKindOption } from "@/types/api";
import { noIndex } from "@/lib/no-index";
import { IndustryForm } from "../industry-form";

export const metadata = buildMetadata({ title: "New industry", path: "/admin/industries/new", seo: noIndex });

export default async function NewIndustryPage() {
  let solutions: { id: number; name: string }[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [solutions, kinds] = await Promise.all([getSolutionOptions(), getAnswerBlockKinds("/admin/industries")]);
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
        back={{ href: "/admin/industries", label: "All industries" }}
        title="New industry"
      />

      <IndustryForm solutions={solutions} kinds={kinds} />
    </>
  );
}
