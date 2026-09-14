import { Card, SectionHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import { webServices } from "@/content/site";

// The process diagram, the AMC inclusion list and the web-services grid are
// genuinely static page furniture, not records anyone edits. Everything that
// IS a record — solutions, categories, industries, case studies, posts,
// brands — arrives as props from the CMS, because editing one in the admin
// previously changed every page except this one.

export function WebServices() {
  return (
    <section data-aos="fade-up" id="services" className="relative overflow-hidden section-y-lg">
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
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {webServices.map((s) => {
            const tint = hueForIcon(s.icon, "globe");
            return (
              <Card key={s.slug} href={`/services/${s.slug}`} tint={tint} padding="md" className="p-5.5">
                <div className="mb-3 flex items-center gap-2.75">
                  <IconTile name={s.icon} fallback="globe" />
                  <h3 className="text-base">{s.title}</h3>
                </div>
                <p className="text-sm leading-[1.55] text-muted">{s.body}</p>
                <div className="mt-3.5 font-mono text-xs text-muted">{s.note}</div>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
