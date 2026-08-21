import Link from "next/link";
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
      <Link href="/admin/case-studies" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All case studies
      </Link>
      <h2 className="display-3 mt-4 mb-6">New case study</h2>

      <CaseStudyForm industries={industries} />
    </>
  );
}
