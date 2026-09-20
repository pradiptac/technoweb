import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { getLandingPage } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LandingPageForm } from "../landing-page-form";
import type { AdminLandingPage } from "@/types/api";

export const metadata = buildMetadata({ title: "Landing page", path: "/admin/landing-pages", seo: noIndex });

export default async function EditLandingPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; drafted?: string }>;
}) {
  const { id } = await params;
  const flags = await searchParams;

  let record: AdminLandingPage;
  try {
    record = await getLandingPage(Number(id));
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title={record.title} back={{ href: "/admin/landing-pages", label: "Landing pages" }} />
      <LandingPageForm record={record} saved={Boolean(flags.saved)} drafted={Boolean(flags.drafted)} />
    </>
  );
}
