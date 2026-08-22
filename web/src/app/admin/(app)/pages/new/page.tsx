import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PageForm } from "../page-form";

export const metadata = buildMetadata({ title: "New page", path: "/admin/pages/new", seo: noIndex });

export default function NewCmsPage() {
  return (
    <>
      <Link href="/admin/pages" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All pages
      </Link>
      <h1 className="admin-title mt-4 mb-6">New page</h1>

      <PageForm />
    </>
  );
}
