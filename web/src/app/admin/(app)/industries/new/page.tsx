import Link from "next/link";
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
      <Link href="/admin/industries" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All industries
      </Link>
      <h1 className="admin-title mt-4 mb-6">New industry</h1>

      <IndustryForm solutions={solutions} />
    </>
  );
}
