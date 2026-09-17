import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { getLocation } from "@/lib/admin";
import { locationPickers } from "../pickers";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LocationForm } from "../location-form";
import type { AdminLocation } from "@/types/api";


export const metadata = buildMetadata({ title: "Place", path: "/admin/locations", seo: noIndex });

export default async function EditLocationPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; blocked?: string }>;
}) {
  const { id } = await params;
  const flags = await searchParams;

  let record: AdminLocation;
  try {
    record = await getLocation(Number(id));
  } catch {
    notFound();
  }

  const options = await locationPickers(record.id);

  return (
    <>
      <PageHeader title={record.name} back={{ href: "/admin/locations", label: "Places" }} />
      <LocationForm record={record} saved={Boolean(flags.saved)} blocked={flags.blocked} {...options} />
    </>
  );
}
