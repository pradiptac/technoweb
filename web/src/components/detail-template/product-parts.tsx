import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHero } from "@/components/ui/page-hero";
import type { Crumb } from "@/components/ui/breadcrumbs";
import { ProductGallery } from "@/components/product/product-gallery";
import { SpecTable } from "@/components/ui/prose";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { DownloadList, downloadRow } from "@/components/downloads/download-list";
import { IconArrowRight, IconCheck } from "@/components/icons";
import type { Product } from "@/types/api";

/*
 * The pieces of a catalogue product's page, lifted out of its route (0.161.0)
 * so the route and a detail template draw each from the same code
 * (docs/page-builder.md "Detail templates"). Moved verbatim.
 */

export const productFullName = (p: Product) => [p.brand?.name, p.name].filter(Boolean).join(" ");

export const productCrumbList = (p: Product): Crumb[] => [
  { name: "Products", path: "/products" },
  ...(p.category ? [{ name: p.category.name, path: `/products/${p.category.slug}` }] : []),
  { name: p.name, path: `/products/${p.slug}` },
];

/** The theme's page heading, with the enquiry and datasheet buttons. */
export function ProductHero({ p, crumbs }: { p: Product; crumbs: Crumb[] }) {
  return (
      <PageHero
        section="products"
        kicker={p.brand?.name ?? "Product"}
        title={p.name}
        lede={p.short_description}
        crumbs={crumbs}
      >
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="#enquire">Request information <IconArrowRight /></ButtonLink>
          {p.datasheet_url && (
            <ButtonLink href={p.datasheet_url} variant="secondary">Download datasheet</ButtonLink>
          )}
          {/*
            No colour of its own: it inherits the hero's ink, which is
            `dark-ink` over a banner and the page's ink on the light ground a
            section with no banner renders. It was `text-dark-muted`, which
            is 2.2:1 on that light ground — the audit found it on 2026-09-21
            the first time this route was run with no banner uploaded.
          */}
          {p.sku && <span className="font-mono text-13">SKU {p.sku}</span>}
        </div>
      </PageHero>
  );
}

/** The pictures beside the panel that decides an enquiry: brand, category, SKU, where it is used. */
export function ProductTop({ p }: { p: Product }) {
  const fullName = productFullName(p);
  const solutions = p.related_solutions ?? [];

  return (
    <>
        <div data-aos="fade-up" className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
          <ProductGallery
            images={p.images ?? []}
            alts={p.image_alts}
            focuses={p.image_focuses}
            blurs={p.image_blurs}
            name={fullName}
            priority
          />

          <div className="grid gap-5 self-start rounded-xl border border-line-strong bg-card p-6 lg:sticky lg:top-24 lg:p-7">
            {p.short_description && (
              <p className="text-15 leading-[1.6] text-ink-2">{p.short_description}</p>
            )}

            {/*
              No price, and that is the brief rather than an omission: this
              catalogue exists to be found by somebody researching a project,
              and most of it is quoted per site. The panel's job is to make the
              next step obvious instead.
            */}
            <div className="grid gap-2.5">
              <ButtonLink href="#enquire">Request information <IconArrowRight /></ButtonLink>
              {p.datasheet_url && (
                <ButtonLink href={p.datasheet_url} variant="secondary">Download datasheet</ButtonLink>
              )}
            </div>

            <dl className="grid gap-2.5 border-t border-line pt-4 text-13-5">
              {p.brand?.name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Brand</dt>
                  <dd className="font-medium">{p.brand.name}</dd>
                </div>
              )}
              {p.category?.name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Category</dt>
                  <dd className="font-medium">
                    <Link href={`/products/${p.category.slug}`} className="hover:underline">{p.category.name}</Link>
                  </dd>
                </div>
              )}
              {p.sku && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">SKU</dt>
                  <dd className="font-mono text-12-5">{p.sku}</dd>
                </div>
              )}
            </dl>

            {solutions.length > 0 && (
              <div className="border-t border-line pt-4">
                <h2 className="text-13-5 font-semibold text-muted">Used in</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {solutions.map((sol) => (
                    <li key={sol.id}>
                      <Link href={`/solutions/${sol.slug}`} className="block rounded-full border border-line-strong px-3 py-1.5 text-13 hover:border-brand-300 hover:bg-brand-50">
                        {sol.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
    </>
  );
}

/** The written overview. */
export function ProductOverview({ p }: { p: Product }) {
  return (
    <>
          {p.description && (
            <section data-aos="fade-up">
              <h2 className="display-3 mb-4">Overview</h2>
              <ProseWithShortcodes html={p.description} />
            </section>
          )}
    </>
  );
}

/** Key features. */
export function ProductFeatures({ p, heading = "Key features" }: { p: Product; heading?: string }) {
  const features = p.features ?? [];

  return (
    <>
          {features.length > 0 && (
            <section data-aos="fade-up">
              <h2 className="display-3">{heading}</h2>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-3 rounded-lg border border-line-strong bg-card p-4">
                    <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" />
                    <span className="text-14-5 leading-[1.55]">{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
    </>
  );
}

/** The specification table. */
export function ProductSpecs({ p, heading = "Specifications" }: { p: Product; heading?: string }) {
  const specs = p.specifications ?? {};

  return (
    <>
          {Object.keys(specs).length > 0 && (
            <section data-aos="fade-up">
              <h2 className="display-3 mb-5">{heading}</h2>
              <div className="rounded-lg border border-line-strong bg-card px-5">
                <SpecTable specs={specs} />
              </div>
            </section>
          )}
    </>
  );
}

/** The downloads centre's files for this product. */
export function ProductDownloads({ p, heading = "Downloads" }: { p: Product; heading?: string }) {
  return (
    <>
          {(p.downloads?.length ?? 0) > 0 && (
            <section id="downloads" data-aos="fade-up" className="scroll-mt-24">
              <h2 className="display-3 mb-5">{heading}</h2>
              <DownloadList rows={(p.downloads ?? []).map(downloadRow)} className="max-w-4xl" />
            </section>
          )}
    </>
  );
}

/** The request-information form, the destination the panel's button links to. */
export function ProductEnquiry({ p, heading = "Request information" }: { p: Product; heading?: string }) {
  const fullName = productFullName(p);

  return (
    <>
          <section id="enquire" data-aos="fade-up" className="scroll-mt-24">
            <div className="max-w-[640px] rounded-xl border border-line-strong bg-surface p-6 lg:p-7">
              <h2 className="display-3">{heading}</h2>
              <p className="mt-2 mb-5 text-14 text-muted">
                Pricing, lead time, or whether this is genuinely the right model for your site.
              </p>
              <EnquiryForm source={`product:${p.slug}`} subject={fullName} compact />
            </div>
          </section>
    </>
  );
}

/** Related hardware. */
export function ProductRelatedHardware({ p, limit = 4 }: { p: Product; limit?: number }) {
  const related = p.related_products ?? [];

  return (
    <>
        {related.length > 0 && (
          <section data-aos="fade-up" className="mt-16 border-t border-line pt-12">
            <h2 className="display-3 mb-6">Related hardware</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.slice(0, limit).map((rp) => (
                <li key={rp.id}>
                  <Card href={`/products/${rp.slug}`} padding="none" className="h-full p-4.5 hover:bg-brand-50">
                    {rp.brand?.name && (
                      <span className="text-11 font-semibold uppercase tracking-[.1em] text-brand-ink">{rp.brand.name}</span>
                    )}
                    <h3 className="mt-1.5 text-15 leading-snug">{rp.name}</h3>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
    </>
  );
}
