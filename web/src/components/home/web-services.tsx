import { SectionHeader } from "@/components/ui/card";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import { webServices } from "@/content/site";

// The process diagram, the AMC inclusion list and the web-services grid are
// genuinely static page furniture, not records anyone edits. Everything that
// IS a record — solutions, categories, industries, case studies, posts,
// brands — arrives as props from the CMS, because editing one in the admin
// previously changed every page except this one.

/** A `Collection` of `services`, drawn in each theme's idiom — see `components/ui/collection.tsx`. */
export function WebServices() {
  return (
    <section id="services" className="relative overflow-hidden section-y-lg">
      {/* Decorative only — see the note on `.pattern-fade` in globals.css. */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-40 [background-image:url(/patterns/network-mesh.svg)] [background-size:1400px_auto] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <SectionHeader
          kicker="Web Services"
          title="The other half of your infrastructure."
          lede="Domains, hosting and business email managed by the same team that runs your office network — one vendor, one number to call."
        />
        <Collection kind="services" cols={3}>
          {webServices.map((s) => (
            <Tile
              key={s.slug}
              href={`/services/${s.slug}`}
              title={s.title}
              summary={s.body}
              icon={<IconTile name={s.icon} fallback="globe" />}
              hue={hueForIcon(s.icon, "globe")}
              meta={<span className="font-mono text-xs">{s.note}</span>}
              cta="Learn more"
            />
          ))}
        </Collection>
      </Container>
    </section>
  );
}
