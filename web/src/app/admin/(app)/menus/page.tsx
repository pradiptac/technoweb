import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { RebuildButton } from "./rebuild-button";
import { Badge } from "@/components/ui/badge";
import { IconMenu } from "@/components/icons";
import { getMenus } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { MenuIndex } from "@/lib/admin";

export const metadata = buildMetadata({ title: "Menus", path: "/admin/menus", seo: noIndex });

export default async function AdminMenusPage() {
  let result: MenuIndex;
  try {
    result = await getMenus();
  } catch {
    return (
      <ErrorState title="We could not load the menus">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { data: menus, meta } = result;
  const assigned = new Map(menus.filter((m) => m.location).map((m) => [m.location, m]));

  return (
    <>
      <PageHeader
        title="Menus"
        lede={<>
          The links across the header and down the footer. A location with no menu assigned
          keeps the navigation built into the site, so this is additive — nothing changes
          until you assign one.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/menus/new" size="sm">New menu</ButtonLink></div>
      </PageHeader>

      {/*
        Locations first, menus second.

        The question somebody opens this screen with is "what is the header
        showing?", not "what menus exist" — and an unassigned location is the
        answer that is easiest to miss, because nothing is broken: the site is
        simply still using its built-in list.
      */}
      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-semibold">Where menus appear</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {meta.locations.map((location) => {
            const menu = assigned.get(location.value);
            return (
              <li key={location.value} className="rounded-lg border border-line-strong bg-card p-3.5">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold">{location.label}</h3>
                  {menu
                    ? <Badge tone="resolved">Assigned</Badge>
                    : <Badge tone="closed">Built-in</Badge>}
                </div>
                <p className="measure mb-2 text-[12.5px] text-muted">{location.hint}</p>
                {menu
                  ? <Link href={`/admin/menus/${menu.id}`} className="text-[12.5px] font-semibold text-brand-ink hover:underline">
                      Edit “{menu.name}” →
                    </Link>
                  : <p className="text-[12.5px] text-faint">
                      Using the site’s built-in navigation. Assign a menu to take it over.
                    </p>}

                {/*
                  The way back from a menu somebody has made a mess of, and the
                  way in for an install that has never run
                  `technoware:seed-menus`. Offered on both cards, assigned or
                  not — an unassigned location still needs a starting point, and
                  building thirty items by hand is the obstacle the command was
                  written for.
                */}
                <div className="mt-3 border-t border-line pt-2.5">
                  <RebuildButton
                    location={location.value}
                    label={location.label}
                    assigned={Boolean(menu)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <h2 className="mb-2 text-[13px] font-semibold">All menus</h2>

      {menus.length === 0 ? (
        <EmptyState icon={<IconMenu />} title="No menus yet">
          Create one, add links to it, and assign it to the header or the footer.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {menus.map((menu) => (
            <li key={menu.id}>
              <Link
                href={`/admin/menus/${menu.id}`}
                /*
                  Wraps below `sm`.

                  A name, a location badge and an item count in one nowrap row
                  is 334px of content in a 320px viewport — measured, and it
                  overflowed the page by 22px. It was never caught because
                  `/admin/menus` is in neither audit's route list, which is the
                  same gap that left the builder itself unaudited until a menu
                  existed to open. Both are in the lists now.
                */
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2.5 hover:border-faint sm:flex-nowrap"
              >
                <span className="min-w-0 flex-1 basis-full truncate text-[13px] font-medium sm:basis-auto">{menu.name}</span>
                {menu.location_label
                  ? <Badge tone="resolved">{menu.location_label}</Badge>
                  : <Badge tone="closed">Not assigned</Badge>}
                <span className="shrink-0 text-[12.5px] text-faint tabular-nums">
                  {menu.item_count ?? 0} item{menu.item_count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
