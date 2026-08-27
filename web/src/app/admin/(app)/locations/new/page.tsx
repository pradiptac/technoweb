import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getLocations, getServices, getSolutions } from "@/lib/admin";
import { LocationForm } from "../location-form";

export const metadata = buildMetadata({ title: "Add a place", path: "/admin/locations/new", seo: noIndex });


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

export default async function NewLocationPage() {
  const options = await pickers();

  return (
    <>
      <PageHeader title="Add a place" back={{ href: "/admin/locations", label: "Places" }} />
      <LocationForm {...options} />
    </>
  );
}
