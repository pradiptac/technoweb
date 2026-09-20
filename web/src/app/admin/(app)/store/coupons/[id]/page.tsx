import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getCoupon } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CouponForm } from "../coupon-form";
import type { AdminCoupon } from "@/lib/admin";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return buildMetadata({ title: "Edit discount code", path: `/admin/store/coupons/${id}`, seo: noIndex });
}

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let coupon: AdminCoupon;

  try {
    coupon = await getCoupon(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/store/coupons", label: "Discount codes" }} title={coupon.code} />
      <CouponForm coupon={coupon} />
    </>
  );
}
