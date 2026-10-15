import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getShipping, type ShippingScreenData } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { ShippingScreen } from "./shipping-screen";

export const metadata = buildMetadata({ title: "Shipping", path: "/admin/store/shipping", seo: noIndex });

/**
 * How the shop charges for delivery (0.142.0, docs/store.md "Delivery charges
 * and shipping zones"): one flat figure, or zones of states with weight slabs.
 * Under Store because it is a store manager's decision — it changes what
 * customers pay — and not a setting an administrator makes on their behalf.
 */
export default async function AdminStoreShippingPage() {
  await requireScreen();

  let data: ShippingScreenData;

  try {
    data = await getShipping();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Store managers only">
          Delivery charges are restricted to store manager and administrator accounts. Ask one to make the
          change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the shipping settings">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Shipping"
        lede={<>
          What delivery costs. The figure on the basket, the checkout, the order and its emails is the one that is
          charged — worked out on the server, from the delivery address and the weight of what is in the basket.
        </>}
      />

      <ShippingScreen data={data} />
    </>
  );
}
