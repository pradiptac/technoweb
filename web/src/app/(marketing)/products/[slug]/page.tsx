import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { PageHero } from "@/components/ui/page-hero";
import { Prose, SpecTable } from "@/components/ui/prose";
import { EmptyState } from "@/components/ui/empty";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { IconArrowRight, IconCheck, IconServer } from "@/components/icons";
import { JsonLd, buildMetadata, jsonLd } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductGrid } from "../product-grid";
import { resolveProductSlug } from "./resolve";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await resolveProductSlug(slug);

  if (r.kind === "category") {
    return buildMetadata({
      title: r.category.name,
      description: r.category.description ?? `${r.category.name} supplied, deployed and supported by Technoware engineers.`,
      path: `/products/${r.category.slug}`,
      seo: r.category.seo,
    });
  }

  if (r.kind === "product") {
    return buildMetadata({
      title: [r.product.brand?.name, r.product.name].filter(Boolean).join(" "),
      description: r.product.short_description,
      path: `/products/${r.product.slug}`,
      image: r.product.images?.[0],
      seo: r.product.seo,
    });
  }

  return buildMetadata({ title: "Not found", path: `/products/${slug}`, seo: noIndex });
}

export default async function ProductOrCategoryPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const r = await resolveProductSlug(slug, sp.page ? `&page=${sp.page}` : "");

  if (r.kind === "none") notFound();

  /* ------------------------------------------------ category listing */
  if (r.kind === "category") {
    const { category, products } = r;

    return (
      <>
        <PageHero
          kicker="Products"
          title={category.name}
          lede={category.description}
          crumbs={[
            { name: "Products", path: "/products" },
            { name: category.name, path: `/products/${category.slug}` },
          ]}
        />

        <Container data-aos="fade-up" className="py-16 lg:py-20">
          {products.data.length > 0 ? (
            <ProductGrid page={products} basePath={`/products/${category.slug}`} params={sp} headingLevel={2} />
          ) : (
            <EmptyState
              icon={<IconServer />}
              title={`No ${category.name.toLowerCase()} listed yet`}
              action={<ButtonLink href="/contact" size="sm">Ask us what we carry</ButtonLink>}
            >
              This part of the catalogue is still being populated. We almost certainly supply
              what you need — ask and we will confirm the model.
            </EmptyState>
          )}
        </Container>

        <CtaBand />
      </>
    );
  }

  /* ------------------------------------------------- product detail */
  const p = r.product;
  const specs = p.specifications ?? {};
  const features = p.features ?? [];
  const related = p.related_products ?? [];
  const solutions = p.related_solutions ?? [];
  const faqs = p.faqs ?? [];
  const fullName = [p.brand?.name, p.name].filter(Boolean).join(" ");

  return (
    <>
      <PageHero
        kicker={p.brand?.name ?? "Product"}
        title={p.name}
        lede={p.short_description}
        crumbs={[
          { name: "Products", path: "/products" },
          ...(p.category ? [{ name: p.category.name, path: `/products/${p.category.slug}` }] : []),
          { name: p.name, path: `/products/${p.slug}` },
        ]}
      >
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="#enquire">Request information <IconArrowRight /></ButtonLink>
          {p.datasheet_url && (
            <ButtonLink href={p.datasheet_url} variant="secondary">Download datasheet</ButtonLink>
          )}
          {p.sku && <span className="font-mono text-[13px] text-muted">SKU {p.sku}</span>}
        </div>
      </PageHero>

      <Container data-aos="fade-up" className="py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div className="min-w-0">
            {p.images && p.images.length > 0 && (
              <div className="mb-10 grid gap-3 sm:grid-cols-2">
                {p.images.slice(0, 4).map((src, i) => (
                  <div key={src} className="grid h-56 place-items-center rounded-lg border border-line-strong bg-surface p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={i === 0 ? fullName : `${fullName} — view ${i + 1}`}
                      className="max-h-full w-full object-contain"
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  </div>
                ))}
              </div>
            )}

            {p.description && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3 mb-4">Overview</h2>
                <Prose html={p.description} />
              </section>
            )}

            {features.length > 0 && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3">Key features</h2>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-3 rounded-lg border border-line-strong bg-white p-4">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                      <span className="text-[14.5px] leading-[1.55]">{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Object.keys(specs).length > 0 && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3 mb-5">Specifications</h2>
                <div className="rounded-lg border border-line-strong bg-white px-5">
                  <SpecTable specs={specs} />
                </div>
              </section>
            )}

            {faqs.length > 0 && <section data-aos="fade-up" className="mb-4"><FaqList faqs={faqs} /></section>}
          </div>

          <aside className="grid content-start gap-5">
            <div id="enquire" className="scroll-mt-24 rounded-xl border border-line-strong bg-surface p-6">
              <h2 className="text-[17px]">Request information</h2>
              <p className="mt-1.5 mb-5 text-[13.5px] text-muted">
                Pricing, lead time, or whether this is genuinely the right model for your site.
              </p>
              <EnquiryForm source={`product:${p.slug}`} subject={fullName} compact />
            </div>

            {solutions.length > 0 && (
              <div className="rounded-xl border border-line-strong bg-white p-5.5">
                <h2 className="text-[15.5px]">Used in</h2>
                <ul className="mt-3.5 flex flex-wrap gap-2">
                  {solutions.map((s) => (
                    <li key={s.id}>
                      <Link href={`/solutions/${s.slug}`} className="block rounded-full border border-line-strong px-3 py-1.5 text-[13px] hover:border-brand-300 hover:bg-brand-50">
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <section data-aos="fade-up" className="mt-16 border-t border-line pt-12">
            <h2 className="display-3 mb-6">Related hardware</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.slice(0, 4).map((rp) => (
                <li key={rp.id}>
                  <Link
                    href={`/products/${rp.slug}`}
                    className="block h-full rounded-lg border border-line-strong bg-white p-4.5 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    {rp.brand?.name && (
                      <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-700">{rp.brand.name}</span>
                    )}
                    <h3 className="mt-1.5 text-[15px] leading-snug">{rp.name}</h3>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <CtaBand />

      <JsonLd
        data={jsonLd.product({
          name: fullName,
          short_description: p.short_description,
          slug: p.slug,
          brand: p.brand,
        })}
      />
    </>
  );
}
