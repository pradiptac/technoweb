import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { FaqList } from "@/components/ui/faq";
import { PageHero } from "@/components/ui/page-hero";
import { ProductGallery } from "@/components/product/product-gallery";
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
          section="products"
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
        section="products"
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

      <Container className="section-y">
        {/*
          The same anatomy the shop's product page uses: the picture on the
          left, the facts that decide an enquiry on the right. It used to stack
          a 2x2 image grid above the prose with the enquiry form off in a
          sidebar — so the photographs and the things somebody actually needs to
          read (what it is, what it costs to find out, how to ask) were never on
          screen together, and the images pushed the body copy below the fold.
        */}
        <div data-aos="fade-up" className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
          <ProductGallery
            images={p.images ?? []}
            alts={p.image_alts}
            name={fullName}
            priority
          />

          <div className="grid gap-5 self-start rounded-xl border border-line-strong bg-card p-6 lg:sticky lg:top-24 lg:p-7">
            {p.short_description && (
              <p className="text-[15px] leading-[1.6] text-ink-2">{p.short_description}</p>
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

            <dl className="grid gap-2.5 border-t border-line pt-4 text-[13.5px]">
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
                  <dd className="font-mono text-[12.5px]">{p.sku}</dd>
                </div>
              )}
            </dl>

            {solutions.length > 0 && (
              <div className="border-t border-line pt-4">
                <h2 className="text-[13.5px] font-semibold text-muted">Used in</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {solutions.map((sol) => (
                    <li key={sol.id}>
                      <Link href={`/solutions/${sol.slug}`} className="block rounded-full border border-line-strong px-3 py-1.5 text-[13px] hover:border-brand-300 hover:bg-brand-50">
                        {sol.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/*
          Everything long-form sits below the split at the page's own measure,
          rather than in a column narrowed by a sidebar. A specification table
          reads badly in 60% of the width and there is nothing beside it that
          needs to stay in view.
        */}
        <div className="mt-14 grid gap-12">
          {p.description && (
            <section data-aos="fade-up">
              <h2 className="display-3 mb-4">Overview</h2>
              <ProseWithShortcodes html={p.description} />
            </section>
          )}

          {features.length > 0 && (
            <section data-aos="fade-up">
              <h2 className="display-3">Key features</h2>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <section data-aos="fade-up">
              <h2 className="display-3 mb-5">Specifications</h2>
              <div className="rounded-lg border border-line-strong bg-card px-5">
                <SpecTable specs={specs} />
              </div>
            </section>
          )}

          {faqs.length > 0 && <section data-aos="fade-up"><FaqList faqs={faqs} /></section>}

          {/*
            The form is a destination now rather than a sidebar widget — the
            panel above links to it and this is where somebody arrives having
            read the specification. `scroll-mt-24` so the sticky header does not
            cover the heading when the anchor lands.
          */}
          <section id="enquire" data-aos="fade-up" className="scroll-mt-24">
            <div className="max-w-[640px] rounded-xl border border-line-strong bg-surface p-6 lg:p-7">
              <h2 className="display-3">Request information</h2>
              <p className="mt-2 mb-5 text-[14px] text-muted">
                Pricing, lead time, or whether this is genuinely the right model for your site.
              </p>
              <EnquiryForm source={`product:${p.slug}`} subject={fullName} compact />
            </div>
          </section>
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
