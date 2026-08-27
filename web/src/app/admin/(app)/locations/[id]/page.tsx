import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { getLocation, getLocations, getServices, getSolutions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LocationForm } from "../location-form";
import type { AdminLocation } from "@/types/api";


/**
 * The pickers the place form needs: everything it can sit inside, and every
 * service and solution that could be offered there.
 *
 * Fetched here rather than in the client component — three round trips on a
 * form that renders once, and a client component cannot reach the admin token
 * anyway.
 */
async function pickers(excludeId?: number) {
  const [places, services, solutions] = await Promise.all([
    getLocations({ per_page: 100 }).then((r) => r.data).catch(() => []),
    getServices({ per_page: 100 }).then((r) => r.data).catch(() => []),
    getSolutions({ per_page: 100 }).then((r) => r.data).catch(() => []),
  ]);

  /*
   * Everything inside the place being edited, so the picker cannot offer it.
   *
   * Excluding only the record itself is not enough and the browser said so:
   * editing Kolkata offered "Salt Lake, Kolkata, West Bengal" as a parent,
   * which is Kolkata's own child. The API refuses that with a 422 about putting
   * a place inside itself — but offering a choice that will be rejected is the
   * conversation this filter exists to avoid.
   */
  const banned = new Set<number>(excludeId ? [excludeId] : []);
  for (let pass = 0; pass < 10; pass++) {
    const before = banned.size;
    for (const p of places) if (p.parent_id && banned.has(p.parent_id)) banned.add(p.id);
    if (banned.size === before) break;
  }

  return {
    parents: places
      .filter((p) => !banned.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, full_name: p.full_name, level: p.level })),
    services: services.map((s) => ({ id: s.id, title: s.title })),
    solutions: solutions.map((s) => ({ id: s.id, title: s.title })),
  };
}

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

  const options = await pickers(record.id);

  return (
    <>
      <PageHeader title={record.name} back={{ href: "/admin/locations", label: "Places" }} />
      <LocationForm record={record} saved={Boolean(flags.saved)} blocked={flags.blocked} {...options} />
    </>
  );
}
