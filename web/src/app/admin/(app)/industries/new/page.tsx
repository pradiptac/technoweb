import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getSolutionOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { IndustryForm } from "../industry-form";

export const metadata = buildMetadata({ title: "New industry", path: "/admin/industries/new", seo: noIndex });

export default async function NewIndustryPage() {
  let solutions: { id: number; name: string }[] = [];
  try {
    solutions = await getSolutionOptions();
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

      <IndustryForm solutions={solutions} />
    </>
  );
}
