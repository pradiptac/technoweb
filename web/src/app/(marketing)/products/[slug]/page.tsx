import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { PageHero } from "@/components/ui/page-hero";
import { SpecTable } from "@/components/ui/prose";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { EmptyState } from "@/components/ui/empty";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { IconArrowRight, IconCheck, IconServer } from "@/components/icons";
import { JsonLd, buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductGrid } from "../product-grid";
import { CatalogueFilters } from "../catalogue-filters";
import { publicApi } from "@/lib/api";
import type { Brand } from "@/types/api";
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
  searchParams: Promise<{ q?: string; brand?: string; sort?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // Only the listing branch uses these, but the resolver decides which branch
  // this is — so they are built before it is known, and cost nothing on a
  // product page beyond a string.
  const filters = new URLSearchParams();
  if (sp.q) filters.set("q", sp.q);
  if (sp.brand) filters.set("brand", sp.brand);
  if (sp.sort) filters.set("sort", sp.sort);
  if (sp.page) filters.set("page", sp.page);
  const qs = filters.toString();

  const r = await resolveProductSlug(slug, qs ? `&${qs}` : "");

  if (r.kind === "none") notFound();

  /* ------------------------------------------------ category listing */
  if (r.kind === "category") {
    const { category, products } = r;
    const solutions = category.related_solutions ?? [];

    // A brand filter is only useful where there is more than one brand to
    // choose between, so the list is fetched but the control hides itself.
    let brands: Brand[] = [];
    try {
      brands = (await publicApi.brands()).data;
    } catch {
      // A missing facet is not worth failing a catalogue page over.
    }

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

        <Container data-aos="fade-up" className="section-y">
          <CatalogueFilters
            action={`/products/${category.slug}`}
            brands={brands}
            total={products.meta.total}
          />

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

          {solutions.length > 0 && (
            <section data-aos="fade-up" className="mt-14 border-t border-line pt-11">
              <h2 className="display-3 mb-2">Where this hardware goes</h2>
              <p className="mb-6 max-w-[62ch] text-[14.5px] leading-[1.6] text-muted">
                Most people reading a category listing are part-way through a project rather
                than shopping for a part. These are the practice areas this kit is deployed in.
              </p>
              <ul className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
                {solutions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/solutions/${s.slug}`}
                      className="flex h-full flex-col rounded-lg border border-line-strong bg-card px-4.5 py-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
                    >
                      <span className="text-[15px] font-semibold leading-snug text-ink">{s.title}</span>
                      {s.summary && (
                        <span className="mt-1 text-[13px] leading-[1.5] text-muted">{s.summary}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
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

      <Container data-aos="fade-up" className="section-y">
        <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div className="min-w-0">
            {p.images && p.images.length > 0 && (
              <div className="mb-10 grid gap-3 sm:grid-cols-2">
                {p.images.slice(0, 4).map((src, i) => (
                  <div key={src} className="grid h-56 place-items-center rounded-lg border border-line-strong bg-surface p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      /* The library's description first — somebody wrote it
                         about this picture. The derived name is a fallback,
                         and it is only ever the product's name rather than
                         a description of what the photograph shows. */
                      alt={p.image_alts?.[i]
                        ?? (i === 0 ? fullName : `${fullName} — view ${i + 1}`)}
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
                <ProseWithShortcodes html={p.description} />
              </section>
            )}

            {features.length > 0 && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3">Key features</h2>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-3 rounded-lg border border-line-strong bg-card p-4">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" />
                      <span className="text-[14.5px] leading-[1.55]">{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Object.keys(specs).length > 0 && (
              <section data-aos="fade-up" className="mb-12">
                <h2 className="display-3 mb-5">Specifications</h2>
                <div className="rounded-lg border border-line-strong bg-card px-5">
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
              <div className="rounded-xl border border-line-strong bg-card p-5.5">
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
                    className="block h-full rounded-lg border border-line-strong bg-card p-4.5 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    {rp.brand?.name && (
                      <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-brand-ink">{rp.brand.name}</span>
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

      {p.schema && <JsonLd data={p.schema} />}
    </>
  );
}
