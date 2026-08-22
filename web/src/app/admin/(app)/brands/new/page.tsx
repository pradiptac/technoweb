import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { BrandForm } from "../brand-form";

export const metadata = buildMetadata({ title: "New brand", path: "/admin/brands/new", seo: noIndex });

export default function NewBrandPage() {
  return (
    <>
      <Link href="/admin/brands" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All brands
      </Link>
      <h1 className="admin-title mt-4 mb-6">New brand</h1>

      <BrandForm />
    </>
  );
}
