import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getStorePromo, type SettingRow } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PromoForm } from "./promo-form";

export const metadata = buildMetadata({ title: "Promo banners", path: "/admin/store/promo", seo: noIndex });

/**
 * The shop front's promo band, a screen of its own under Store — the info
 * bar's shape. It was a run of eight fields at the bottom of Settings →
 * Store, which is the wrong door twice over: the person running a promotion
 * is the store manager, who cannot open Settings at all, and a banner on the
 * shop front is found by whoever looks under Store. The rows are still the
 * `store_promo` settings group; what is new is `PATCH /admin/store/promo`,
 * which reaches those eight keys under `role:store_manager` and no other.
 */
export default async function AdminStorePromoPage() {
  let rows: SettingRow[];
  try {
    rows = await getStorePromo();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Store managers only">
          The promo banners are restricted to store manager and administrator
          accounts. Ask one to make the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the promo banner">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Promo banners"
        lede={<>
          Two tiles side by side and the dark band under them, on the shop
          front between the top picks and the latest products — each a
          headline and a picture linking to whatever is on offer. Changes
          reach the site immediately.
        </>}
      />

      <PromoForm rows={rows} />
    </>
  );
}
