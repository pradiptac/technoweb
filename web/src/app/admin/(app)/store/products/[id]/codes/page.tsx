import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { ApiError } from "@/lib/api";
import { getDigitalCodes, getStoreProduct } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CodesPanel } from "./codes-panel";
import type { AdminStoreProduct } from "@/types/api";
import type { CodeIndex } from "@/lib/admin";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return buildMetadata({
    title: "Activation codes",
    path: `/admin/store/products/${id}/codes`,
    seo: noIndex,
  });
}

export default async function CodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const productId = Number(id);
  if (!Number.isInteger(productId)) notFound();

  let product: AdminStoreProduct;
  let codes: CodeIndex;

  try {
    [product, codes] = await Promise.all([getStoreProduct(productId), getDigitalCodes(productId)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load the inventory">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: `/admin/store/products/${productId}`, label: product.name }}
        title="Activation codes"
        lede={<>
          The licence keys held for this product. They are encrypted where they are stored, and
          reading one is recorded — this list deliberately does not print them.
        </>}
      />

      {/*
        A physical product with codes is a data mistake somebody should be able
        to see rather than one hidden by the screen, so the inventory is shown
        whatever the type — with a word about it when the type does not match.
      */}
      {product.type !== "digital" && (
        <p className="measure mb-4 text-[13px] text-warn">
          This product is a {product.type_label ?? product.type}, so nothing here is ever issued
          automatically. Change its type to Digital if it should be.
        </p>
      )}

      <CodesPanel
        productId={productId}
        codes={codes.data}
        available={codes.meta.available}
        delivered={codes.meta.delivered}
      />
    </>
  );
}
