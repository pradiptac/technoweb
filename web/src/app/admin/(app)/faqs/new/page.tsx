import Link from "next/link";
import { ErrorState } from "@/components/ui/empty";
import { getFaqOwners } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { FaqForm } from "../faq-form";
import type { FaqOwnerGroup } from "@/types/api";

export const metadata = buildMetadata({ title: "New FAQ", path: "/admin/faqs/new", seo: noIndex });

export default async function NewFaqPage() {
  let owners: FaqOwnerGroup[] = [];
  try {
    owners = await getFaqOwners();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <Link href="/admin/faqs" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All FAQs
      </Link>
      <h2 className="display-3 mt-4 mb-6">New FAQ</h2>

      <FaqForm owners={owners} />
    </>
  );
}
