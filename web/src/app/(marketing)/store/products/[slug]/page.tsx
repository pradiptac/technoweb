import Image from "next/image";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Badge } from "@/components/ui/badge";
import { Prose, SpecTable } from "@/components/ui/prose";
import { IconBox, IconCheck } from "@/components/icons";
import { AddToBasket } from "@/components/store/add-to-basket";
import { publicApi } from "@/lib/api";
import { formatPaise } from "@/lib/money";
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
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <div className="grid gap-3">
              <div className="grid h-80 place-items-center overflow-hidden rounded-lg border border-line-strong bg-surface p-6">
                {product.images?.[0] ? (
                  <Image
                    src={product.images[0]}
                    // Alt text lives with the file in the media library and is
                    // resolved by path, so it describes the picture rather than
                    // repeating the product's name.
                    alt={product.image_alts?.[0] ?? product.name}
                    width={520}
                    height={300}
                    className="max-h-full w-auto object-contain"
                    unoptimized
                    priority
                  />
                ) : (
                  <span className="text-faint"><IconBox /></span>
                )}
              </div>

              {product.images && product.images.length > 1 && (
                <ul className="grid grid-cols-4 gap-3">
                  {product.images.slice(1, 5).map((src, i) => (
                    <li key={src} className="grid h-20 place-items-center overflow-hidden rounded border border-line bg-surface p-2">
                      <Image
                        src={src}
                        alt={product.image_alts?.[i + 1] ?? ""}
                        width={120}
                        height={80}
                        className="max-h-full w-auto object-contain"
                        unoptimized
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-5 rounded-lg border border-line-strong bg-card p-6">
              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-[32px] font-semibold tabular-nums leading-none">
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
                <p className="mt-1 text-[13px] text-muted">Includes 18% GST. This is the price you pay.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {product.in_stock
                  ? <Badge tone="resolved">In stock</Badge>
                  : <Badge tone="urgent">Out of stock</Badge>}
                {product.sku && (
                  <span className="font-mono text-[12.5px] text-muted">{product.sku}</span>
                )}
              </div>

              <AddToBasket product={product} />
            </div>
          </div>

          {product.features && product.features.length > 0 && (
            <div className="mt-10">
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
            <div className="mt-10">
              <h2 className="display-3 mb-4">Specification</h2>
              <SpecTable specs={product.specifications} />
            </div>
          )}

          {product.description && (
            <div className="mt-10">
              <h2 className="display-3 mb-4">Details</h2>
              <Prose html={product.description} />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
