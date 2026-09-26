import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getAnswerBlockKinds, getIndustries, getProductOptions, getCustomFieldGroups } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SolutionForm } from "../solution-form";
import type { AdminIndustry, PickerOption, AnswerBlockKindOption } from "@/types/api";

export const metadata = buildMetadata({ title: "New solution", path: "/admin/solutions/new", seo: noIndex });

export default async function NewSolutionPage() {
  let products: PickerOption[] = [];
  let industries: AdminIndustry[] = [];
  let kinds: AnswerBlockKindOption[] = [];
  try {
    [products, industries, kinds] = await Promise.all([getProductOptions(), getIndustries(), getAnswerBlockKinds("/admin/solutions")]);
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
        back={{ href: "/admin/solutions", label: "All solutions" }}
        title="New solution"
      />

      <SolutionForm products={products} industries={industries} kinds={kinds} fieldGroups={await getCustomFieldGroups("/admin/solutions")} />
    </>
  );
}
