import { LogoMarquee, type StripMode } from "@/components/company/logo-marquee";
import type { Client } from "@/types/api";

/**
 * The client wall as a strip: featured clients first, and the first dozen
 * published when nobody has ticked any. After `WhyUs` — the argument, then
 * who has already been persuaded by it.
 */
/**
 * `mode` is the theme's choice of motion (see `StripMode`); the flip tiles
 * are the wall as it shipped, and a theme choosing another mode gets the
 * plain logo slots at the wall's larger size, since a flip tile is a
 * scrolling thing by construction.
 */
export function TrustedBy({ items, mode = "flip" }: { items: Client[]; mode?: StripMode | "flip" }) {
  const featured = items.filter((c) => c.is_featured);
  const shown = (featured.length > 0 ? featured : items).slice(0, 12);

  // `lg`: a client's logo is the point of the strip, where a vendor's is a credential.
  return (
    <LogoMarquee
      items={shown.map((c) => ({ id: c.id, name: c.name, logo: c.logo, detail: c.industry?.name ?? null }))}
      caption="Trusted by"
      variant={mode === "flip" ? "flip" : "logos"}
      size="lg"
      mode={mode === "flip" ? "marquee" : mode}
      className="border-t"
    />
  );
}
