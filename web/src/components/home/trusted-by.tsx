import { LogoMarquee } from "@/components/company/logo-marquee";
import type { Client } from "@/types/api";

/**
 * The client wall as a strip: featured clients first, and the first dozen
 * published when nobody has ticked any. After `WhyUs` — the argument, then
 * who has already been persuaded by it.
 */
export function TrustedBy({ items }: { items: Client[] }) {
  const featured = items.filter((c) => c.is_featured);
  const shown = (featured.length > 0 ? featured : items).slice(0, 12);

  // `lg`: a client's logo is the point of the strip, where a vendor's is a credential.
  return (
    <LogoMarquee
      items={shown.map((c) => ({ id: c.id, name: c.name, logo: c.logo, detail: c.industry?.name ?? null }))}
      caption="Trusted by"
      variant="flip"
      className="border-t"
    />
  );
}
