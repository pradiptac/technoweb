import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getInvoicing } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { InvoicingForm } from "./invoicing-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Tax and invoicing", path: "/admin/store/invoicing", seo: noIndex });

/**
 * Store → Tax and invoicing (0.176.0, `docs/store.md` "The GST invoice").
 *
 * A screen of its own under Store, the shape the promo banner and the
 * product videos already have, and for the same reason: the GST rate a shop
 * charges and the name on its invoices belong to the person running the
 * shop, and a store manager cannot open Settings at all. `PATCH
 * /admin/store/invoicing` reaches fifteen named keys under
 * `role:store_manager` and no others.
 */
export default async function AdminStoreInvoicingPage() {
  await requireScreen();

  let data: Awaited<ReturnType<typeof getInvoicing>>;

  try {
    data = await getInvoicing();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Store managers only">
          Tax and invoicing is restricted to store manager and administrator
          accounts. Ask one to make the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the invoicing settings">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Tax and invoicing"
        lede={<>
          What GST the shop charges, whether its prices include it, and the seller&rsquo;s half of a tax invoice.
          With this filled in and switched on, every order makes its own invoice the moment it is paid.
        </>}
      />

      <InvoicingForm rows={data.rows} meta={data.meta} />
    </>
  );
}
