import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { RedirectForm } from "../redirect-form";

export const metadata = buildMetadata({ title: "New redirect", path: "/admin/redirects/new", seo: noIndex });

export default function NewRedirectPage() {
  return (
    <>
      <Link href="/admin/redirects" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All redirects
      </Link>
      <h2 className="display-3 mt-4 mb-6">New redirect</h2>

      <RedirectForm />
    </>
  );
}
