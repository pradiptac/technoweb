import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { IconServer } from "@/components/icons";
import { CompareTray } from "@/components/product/compare";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { COMPARE_MAX } from "@/lib/compare-max";
import type { Product } from "@/types/api";

/**
 * Hardware side by side: `?p=slug,slug,slug`, up to four.
 *
 * Every product carries an ordered spec sheet (`SpecSheet` keeps the order
 * an editor set), so the table's rows are the union of the sheets' keys in
 * first-seen order, with "—" where a product does not state one. That is
 * the whole feature — a catalogue is browsed by comparing, and a
 * distributor's PDF cannot do this.
 *
 * Fetched by slug, one `publicApi.product()` per column, because that is
 * the cached read the product page already makes; a slug that resolves to
 * nothing is left out rather than failing the page. `noindex`: the URL is
 * whatever somebody ticked, and an unbounded set of thin pages is not
 * something the site chose to publish — the search page's rule. Dynamic
 * (it reads `searchParams`), so it sits outside the ISR cache like the
 * catalogue listing does.
 */
export const metadata = buildMetadata({
  title: "Compare products",
  description: "Hardware from the Technoware catalogue, side by side.",
  path: "/products/compare",
  seo: noIndex,
});

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p = "" } = await searchParams;
  const slugs = [...new Set(p.split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s)))].slice(0, COMPARE_MAX);

  const products = (await Promise.all(
    slugs.map((slug) => publicApi.product(slug).then((r) => r.data).catch(() => null)),
  )).filter((x): x is Product => x !== null);

  // The union of every sheet's keys, in the order they were first seen.
  const keys: string[] = [];
  for (const product of products) for (const key of Object.keys(product.specifications ?? {})) if (!keys.includes(key)) keys.push(key);

  return (
    <>
      <PageHero
        kicker="Catalogue"
        title="Compare products"
        lede={products.length >= 2 ? `${products.length} products, every specification they state, side by side.` : "Tick Compare on two or more products in the catalogue to see them here."}
        section="products"
        crumbs={[{ name: "Products", path: "/products" }, { name: "Compare", path: "/products/compare" }]}
      />

      <Container className="section-y">
        {products.length < 2 ? (
          <EmptyState icon={<IconServer />} title="Nothing to compare yet">
            Browse the <Link href="/products" className="font-semibold text-brand-ink underline">catalogue</Link> and tick
            Compare on the products you are weighing up — two to {COMPARE_MAX} of them.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="w-full min-w-[640px] text-left text-14">
              <thead>
                <tr className="border-b border-line-strong align-top">
                  <th scope="col" className="w-[18ch] px-4 py-4 text-12 font-semibold uppercase tracking-[.06em] text-faint">Specification</th>
                  {products.map((product) => (
                    <th key={product.id} scope="col" className="px-4 py-4 font-normal">
                      <div className="relative mb-3 grid aspect-[4/3] w-full max-w-[220px] place-items-center overflow-hidden rounded-md border border-line bg-surface">
                        {product.images?.[0] ? (
                          <Image src={product.images[0]} alt={product.image_alts?.[0] ?? ""} fill sizes="220px" className="object-cover" />
                        ) : (
                          <IconServer className="size-8 text-line-strong" />
                        )}
                      </div>
                      {product.brand?.name && <span className="block text-11 font-semibold uppercase tracking-[.1em] text-brand-ink">{product.brand.name}</span>}
                      <Link href={`/products/${product.slug}`} className="mt-1 block text-15-5 font-semibold leading-snug text-ink hover:underline">{product.name}</Link>
                      {product.sku && <span className="mt-1 block font-mono text-12 text-muted">{product.sku}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr><td colSpan={products.length + 1} className="px-4 py-6 text-muted">None of these products carries a specification sheet yet.</td></tr>
                )}
                {keys.map((key) => (
                  <tr key={key} className="border-b border-line last:border-b-0 align-top">
                    <th scope="row" className="px-4 py-2.5 text-13 font-semibold text-muted">{key}</th>
                    {products.map((product) => (
                      <td key={product.id} className="px-4 py-2.5 text-14">{product.specifications?.[key] ?? <span className="text-faint">—</span>}</td>
                    ))}
                  </tr>
                ))}
                <tr className="align-top">
                  <th scope="row" className="px-4 py-3 text-13 font-semibold text-muted">Next step</th>
                  {products.map((product) => (
                    <td key={product.id} className="px-4 py-3">
                      <ButtonLink href={`/products/${product.slug}#enquire`} size="sm">Request information</ButtonLink>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Container>

      <CompareTray />
    </>
  );
}
