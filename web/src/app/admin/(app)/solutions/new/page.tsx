import Link from "next/link";
import { ErrorState } from "@/components/ui/empty";
import { getIndustries, getProducts } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SolutionForm } from "../solution-form";
import type { AdminIndustry, AdminProduct } from "@/types/api";

export const metadata = buildMetadata({ title: "New solution", path: "/admin/solutions/new", seo: noIndex });

export default async function NewSolutionPage() {
  let products: AdminProduct[] = [];
  let industries: AdminIndustry[] = [];
  try {
    [products, industries] = await Promise.all([getProducts(), getIndustries()]);
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <Link href="/admin/solutions" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All solutions
      </Link>
      <h2 className="display-3 mt-4 mb-6">New solution</h2>

      <SolutionForm products={products} industries={industries} />
    </>
  );
}
