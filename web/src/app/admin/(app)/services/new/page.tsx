import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceForm } from "../service-form";

export const metadata = buildMetadata({ title: "New service", path: "/admin/services/new", seo: noIndex });

export default function NewServicePage() {
  return (
    <>
      <Link href="/admin/services" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All services
      </Link>
      <h1 className="admin-title mt-4 mb-6">New service</h1>

      <ServiceForm />
    </>
  );
}
