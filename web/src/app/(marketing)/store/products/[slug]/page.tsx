import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { Prose, SpecTable } from "@/components/ui/prose";
import { IconCheck } from "@/components/icons";
import { AddToBasket } from "@/components/store/add-to-basket";
import { ProductGallery } from "@/components/product/product-gallery";
import { publicApi } from "@/lib/api";
import { formatPaise, percentOff } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import type { StoreProduct } from "@/types/api";

async function load(slug: string): Promise<StoreProduct | null> {
  try {
    return (await publicApi.storeProduct(slug)).data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await load(slug);

  if (!product) return buildMetadata({ title: "Not found", path: `/store/products/${slug}` });

  return buildMetadata({
    title: product.name,
    description: product.short_description ?? undefined,
    path: `/store/products/${product.slug}`,
    seo: product.seo,
  });
}

export default async function StoreProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await load(slug);

  if (!product) notFound();

  const discounted = product.compare_at_paise && product.compare_at_paise > product.price_paise;

  return (
    <>
      <PageHero
        section="store"
        kicker={product.brand?.name ?? "Store"}
        title={product.name}
        lede={product.short_description}
        crumbs={[
          { name: "Store", path: "/store" },
          ...(product.category
            ? [{ name: product.category.name, path: `/store/categories/${product.category.slug}` }]
            : []),
        ]}
      />

      <section className="section-y">
        <Container>
          {/*
            The standard product layout: the picture on the left, everything
            that decides a purchase on the right. Equal columns rather than the
            previous 1.1fr/1fr — the buy panel now carries the price, the stock,
            the variations, the basket and the terms, and it was the half being
            squeezed.
          */}
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
            <ProductGallery
              images={product.images ?? []}
              alts={product.image_alts}
              name={product.name}
              priority
            />

            {/*
              `lg:sticky` so the price and the basket stay in view while
              somebody reads the specification below. `top-24` clears the site
              header; `self-start` is what lets a sticky child work inside a
              grid whose items would otherwise stretch to the row height.
            */}
            <div className="grid gap-5 self-start rounded-xl border border-line-strong bg-card p-6 lg:sticky lg:top-24 lg:p-7">
              <div className="flex flex-wrap items-center gap-2">
                {product.in_stock
                  ? <Badge tone="resolved">In stock</Badge>
                  : <Badge tone="urgent">Out of stock</Badge>}
                {discounted && product.compare_at_paise && (
                  <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-semibold text-ok">
                    Save {percentOff(product.price_paise, product.compare_at_paise)}%
                  </span>
                )}
                {!product.returnable && (
                  <span className="text-[12.5px] font-medium text-warn">Non-returnable</span>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-[34px] font-semibold leading-none tabular-nums">
                    {formatPaise(product.price_paise)}
                  </span>
                  {discounted && (
                    <span className="text-[16px] tabular-nums text-faint line-through">
                      {formatPaise(product.compare_at_paise!)}
                    </span>
                  )}
                </div>
                {/*
                  Said once, plainly, beside the number it is about. The brief
                  asks for it and it is also the difference between a price
                  somebody trusts and one they have to work out.
                */}
                <p className="mt-1.5 text-[13px] text-muted">Includes 18% GST. This is the price you pay.</p>
              </div>

              {product.short_description && (
                <p className="text-[14.5px] leading-[1.6] text-ink-2">{product.short_description}</p>
              )}

              <AddToBasket product={product} />

              {/*
                The three things a buyer checks before pressing the button, in
                the panel that holds the button rather than in a strip further
                down the page. Static copy, the same call `storeTrustFeatures`
                makes: these are terms of the shop, not facts about this row.
              */}
              <ul className="grid gap-2 border-t border-line pt-4 text-[13px] text-muted">
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Shipped across India, tracked end to end.</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Sourced from an authorised distributor.</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>Backed by the engineers who install it.</li>
              </ul>

              {product.sku && (
                <p className="font-mono text-[12.5px] text-faint">SKU {product.sku}</p>
              )}
            </div>
          </div>

          {product.features && product.features.length > 0 && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">What you get</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {product.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[14px]">
                    <span className="mt-0.5 shrink-0 text-brand-ink"><IconCheck /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">Specification</h2>
              <SpecTable specs={product.specifications} />
            </div>
          )}

          {product.description && (
            <div className="mt-14">
              <h2 className="display-3 mb-4">Details</h2>
              <Prose html={product.description} />
            </div>
          )}
        </Container>
      </section>

    </>
  );
}
