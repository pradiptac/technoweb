import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CouponForm } from "../coupon-form";

export const metadata = buildMetadata({ title: "New discount code", path: "/admin/store/coupons/new", seo: noIndex });

export default function NewCouponPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/store/coupons", label: "Discount codes" }} title="New discount code" />
      <CouponForm />
    </>
  );
}
