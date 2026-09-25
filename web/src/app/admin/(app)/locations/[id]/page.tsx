import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { getLocation } from "@/lib/admin";
import { locationPickers } from "../pickers";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LocationForm } from "../location-form";
import type { AdminLocation } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";


export const metadata = buildMetadata({ title: "Place", path: "/admin/locations", seo: noIndex });

export default async function EditLocationPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; blocked?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const flags = await searchParams;

  // The pickers need only the id, which `params` already holds, so they are
  // fetched beside the record rather than after it — every sibling edit
  // screen already does this, and this was the one still paying two trips.
  let record: AdminLocation;
  let options: Awaited<ReturnType<typeof locationPickers>>;
  try {
    [record, options] = await Promise.all([getLocation(Number(id)), locationPickers(Number(id))]);
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title={record.name} back={{ href: "/admin/locations", label: "Places" }} />
      <LocationForm record={record} saved={Boolean(flags.saved)} blocked={flags.blocked} {...options} />
    </>
  );
}
