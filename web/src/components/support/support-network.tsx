import { COUNTRIES, MAP_HEIGHT, MAP_WIDTH, project } from "@/content/world-map";
import type { SupportCentre } from "@/types/support";
import { SupportNetworkControls } from "./support-network-controls";
import { zoomFor, type MapBox } from "./map-zoom";

type Level = 2 | 3;

/**
 * The support network (0.170.0, docs/support-network.md): a map drawn here —
 * no tiles, no third party, no cookie — with a pin per centre, and the
 * centres listed country by country, city by city.
 *
 * Server-rendered whole: the outlines (Natural Earth, India's own boundary),
 * the pins and the cards are in the HTML, so it works without JavaScript and
 * the list is what a screen reader and a search engine read. The map is
 * `aria-hidden` and its pins are not tab stops — every action is on a card.
 * The small island (`SupportNetworkControls`) adds the country chips that
 * zoom the map, and joins a pressed pin to its card and a card to its pin.
 *
 * A network in one country opens zoomed to it.
 */
export function SupportNetwork({
  centres, headingLevel = 2, country,
}: {
  centres: SupportCentre[];
  headingLevel?: Level;
  /** Open on this country (a builder section's preset). */
  country?: string | null;
}) {
  const H = `h${headingLevel}` as const;
  const H2 = `h${headingLevel + 1}` as "h3" | "h4";

  // Country → city → centres, in the API's order.
  const groups = new Map<string, { name: string; cities: Map<string, SupportCentre[]> }>();
  for (const c of centres) {
    const g = groups.get(c.country_code) ?? { name: c.country, cities: new Map() };
    g.cities.set(c.city, [...(g.cities.get(c.city) ?? []), c]);
    groups.set(c.country_code, g);
  }
  const codes = [...groups.keys()];
  const withCentres = new Set(codes);
  const boxes = Object.fromEntries(
    COUNTRIES.filter((c) => withCentres.has(c.code)).map((c) => [c.code, c.box]),
  ) as Record<string, MapBox>;
  const start = country && boxes[country] ? country : codes.length === 1 ? codes[0]! : null;
  const zoom = zoomFor(start ? boxes[start] ?? null : null, MAP_WIDTH, MAP_HEIGHT);

  return (
    <div data-support-network>
      <SupportNetworkControls
        countries={codes.map((code) => ({ code, name: groups.get(code)!.name, count: [...groups.get(code)!.cities.values()].flat().length }))}
        boxes={boxes}
        start={start}
        mapWidth={MAP_WIDTH}
        mapHeight={MAP_HEIGHT}
      >
        <div className="overflow-hidden rounded-xl border border-line-strong bg-card shadow-1">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            // Taller than the world's own shape on a phone, cropped around the
            // middle — where the zoom puts the chosen country.
            className="block h-64 w-full sm:h-auto"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            data-support-map
            style={{ ["--s" as string]: zoom.s }}
          >
            <g data-map-zoom style={{ transform: zoom.transform }}>
              {COUNTRIES.map((c) => (
                <path key={`${c.code}-${c.name}`} d={c.d} data-has-centre={withCentres.has(c.code) ? "" : undefined} className="support-land" />
              ))}
              {centres.filter((c) => c.latitude !== null && c.longitude !== null).map((c) => {
                const p = project(c.latitude!, c.longitude!);
                return (
                  <g key={c.slug} data-pin={c.slug} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`} className="support-pin">
                    <title>{`${c.name}, ${c.city}`}</title>
                    <circle className="support-pin-halo" r={10} />
                    <circle className="support-pin-dot" r={4.5} />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div className="mt-10 grid gap-12">
          {codes.map((code) => {
            const g = groups.get(code)!;
            return (
              <section key={code} data-country-group={code} aria-labelledby={`country-${code}`} hidden={start && codes.length > 1 ? code !== start : undefined}>
                <H id={`country-${code}`} className="mb-5 text-22 font-semibold after:mt-2.5 after:block after:h-[3px] after:w-10 after:rounded-full after:bg-brand-600">
                  {g.name}
                </H>
                <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                  {[...g.cities.entries()].flatMap(([city, list]) => list.map((c) => (
                    <article
                      key={c.slug}
                      id={c.slug}
                      tabIndex={-1}
                      data-centre-card={c.slug}
                      className="flex min-w-0 flex-col rounded-xl border border-line-strong bg-card p-5 shadow-1 outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus-visible:ring-2 focus-visible:ring-brand-600 data-[active]:border-brand-600 data-[active]:shadow-2"
                    >
                      <p className="text-12 font-semibold tracking-[.06em] text-brand-ink uppercase">{c.kind_label} · {city}</p>
                      <H2 className="mt-1 text-17 font-semibold text-ink">{c.name}</H2>
                      {c.address && <p className="mt-2 text-14 whitespace-pre-line text-ink-2">{c.address}{c.region ? `\n${c.region}` : ""}</p>}
                      <dl className="mt-3 grid gap-1 text-14">
                        {c.phone && (
                          <div className="flex gap-2"><dt className="sr-only">Phone</dt><dd><a className="font-semibold text-brand-ink hover:underline" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a></dd></div>
                        )}
                        {c.phone_alt && (
                          <div className="flex gap-2"><dt className="sr-only">Other phone</dt><dd><a className="text-brand-ink hover:underline" href={`tel:${c.phone_alt.replace(/[^\d+]/g, "")}`}>{c.phone_alt}</a></dd></div>
                        )}
                        {c.email && (
                          <div className="flex gap-2"><dt className="sr-only">Email</dt><dd className="min-w-0 break-words"><a className="text-brand-ink hover:underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>
                        )}
                        {c.hours && (
                          <div className="flex gap-2"><dt className="sr-only">Hours</dt><dd className="text-muted">{c.hours}</dd></div>
                        )}
                      </dl>
                      {c.staff.length > 0 && (
                        <ul className="mt-4 grid gap-1 border-t border-line pt-3 text-13-5" aria-label={`People at ${c.name}`}>
                          {c.staff.map((s) => (
                            <li key={s.name}><span className="font-semibold text-ink">{s.name}</span>{s.title && <span className="text-muted"> · {s.title}</span>}</li>
                          ))}
                        </ul>
                      )}
                      {c.latitude !== null && c.longitude !== null && (
                        <p className="mt-auto pt-4">
                          <a
                            className="text-13-5 font-semibold text-brand-ink hover:underline"
                            href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Directions<span className="sr-only"> to {c.name} (opens Google Maps)</span>
                          </a>
                        </p>
                      )}
                    </article>
                  )))}
                </div>
              </section>
            );
          })}
        </div>
      </SupportNetworkControls>
    </div>
  );
}
