import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { CtaBand } from "@/components/ui/cta-band";
import { AnswerBlocks } from "@/components/content/answer-blocks";
import { CustomFieldDetails } from "@/components/content/custom-field-details";
import { RelatedEntities } from "@/components/content/related-entities";
import { PageHero } from "@/components/ui/page-hero";
import { RecordSections, laidOutAsSections } from "@/components/page-sections/record-sections";
import { EmptyState } from "@/components/ui/empty";
import { IconServer } from "@/components/icons";
import { JsonLd, buildMetadata, listingMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ProductGrid } from "@/components/product/product-grid";
import { CatalogueFilters } from "../catalogue-filters";
import { publicApi } from "@/lib/api";
import type { Brand } from "@/types/api";
import { resolveProductSlug } from "./resolve";
import { brandName } from "@/lib/brand";
import { ProductDownloads, ProductEnquiry, ProductFeatures, ProductHero, ProductOverview, ProductRelatedHardware, ProductSpecs, ProductTop, productCrumbList } from "@/components/detail-template/product-parts";
import { ProductTemplate } from "@/components/detail-template/product-template";

export async function generateMetadata({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; brand?: string; sort?: string; page?: string }>;
}) {
  const { slug } = await params;
  const r = await resolveProductSlug(slug);

  if (r.kind === "category") {
    // A listing: self-referencing canonical per page, a search or brand facet unindexed — `listingMetadata`.
    return listingMetadata({
      title: r.category.name,
      description: r.category.description ?? `${r.category.name} supplied, deployed and supported by ${brandName()} engineers.`,
      path: `/products/${r.category.slug}`,
      seo: r.category.seo,
      searchParams: await searchParams,
      filters: ["q", "brand"],
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

          {/* The category's answer blocks and FAQs, then what it is connected to, before the solutions grid. */}
          <AnswerBlocks blocks={category.answer_blocks} faqs={category.faqs ?? []} className="mt-14" />
          <RelatedEntities entity={category.entity} className="mt-14" />

          {solutions.length > 0 && (
            <section data-aos="fade-up" className="mt-14 border-t border-line pt-11">
              <h2 className="display-3 mb-2">Where this hardware goes</h2>
              <p className="mb-6 text-14-5 leading-[1.6] text-muted">
                Most people reading a category listing are part-way through a project rather
                than shopping for a part. These are the practice areas this kit is deployed in.
              </p>
              <ul className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
                {solutions.map((s) => (
                  <li key={s.id}>
                    <Card href={`/solutions/${s.slug}`} padding="none" className="flex h-full flex-col px-4.5 py-4 hover:bg-brand-50">
                      <span className="text-15 font-semibold leading-snug text-ink">{s.title}</span>
                      {s.summary && (
                        <span className="mt-1 text-13 leading-[1.5] text-muted">{s.summary}</span>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Container>

        <CtaBand />

        {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
        {category.faq_schema && <JsonLd data={category.faq_schema} />}
      </>
    );
  }

  /* ------------------------------------------------- product detail */
  const p = r.product;

  // An active detail template lays the page out (0.161.0, docs/page-builder.md "Detail templates"); with none, the page below is unchanged.
  if (p.detail_template) return <ProductTemplate p={p} />;

  const faqs = p.faqs ?? [];
  const productCrumbs = productCrumbList(p);
  // Builder sections in place of the written description (0.130.0).
  const laidOut = laidOutAsSections(p);

  // Everything under the picture and the panel. With sections it follows them.
  const rest = (
    <>
        {/*
          Everything long-form sits below the split at the page's own measure,
          rather than in a column narrowed by a sidebar. A specification table
          reads badly in 60% of the width and there is nothing beside it that
          needs to stay in view.
        */}
        <div className={laidOut ? "grid gap-12" : "mt-14 grid gap-12"}>
          {!laidOut && <ProductOverview p={p} />}

          <ProductFeatures p={p} />

          <ProductSpecs p={p} />

          {/* The downloads centre's files for this product (docs/downloads.md): its datasheet, drivers, firmware. */}
          <ProductDownloads p={p} />

          {/* The answer blocks with the FAQs merged into their questions, then what the product is connected to. */}
          {/* Custom fields in "details" groups (docs/custom-content.md): nothing when there are none. */}
          <CustomFieldDetails fields={p.custom_fields} className="mb-12" />
          <AnswerBlocks blocks={p.answer_blocks} faqs={faqs} />
          <RelatedEntities entity={p.entity} />

          {/*
            The form is a destination now rather than a sidebar widget — the
            panel above links to it and this is where somebody arrives having
            read the specification. `scroll-mt-24` so the sticky header does not
            cover the heading when the anchor lands.
          */}
          <ProductEnquiry p={p} />
        </div>

        <ProductRelatedHardware p={p} />
    </>
  );

  return (
    <>
      <ProductHero p={p} crumbs={productCrumbs} />

      <Container className="section-y">
        {/*
          The same anatomy the shop's product page uses: the picture on the
          left, the facts that decide an enquiry on the right. It used to stack
          a 2x2 image grid above the prose with the enquiry form off in a
          sidebar — so the photographs and the things somebody actually needs to
          read (what it is, what it costs to find out, how to ask) were never on
          screen together, and the images pushed the body copy below the fold.
        */}
        <ProductTop p={p} />

        {!laidOut && rest}
      </Container>

      {/*
        Builder sections in place of the Overview (0.130.0): full-width bands
        under the picture and the panel, and everything long-form after them
        in a container of its own.
      */}
      {laidOut && (
        <>
          <RecordSections sections={p.sections ?? []} crumbs={productCrumbs} />
          <Container className="section-y">{rest}</Container>
        </>
      )}

      <CtaBand />

      {p.schema && <JsonLd data={p.schema} />}
      {/* The FAQPage over the FAQs and question blocks — the API's, absent under two entries, and the only one on the page. */}
      {p.faq_schema && <JsonLd data={p.faq_schema} />}
    </>
  );
}
