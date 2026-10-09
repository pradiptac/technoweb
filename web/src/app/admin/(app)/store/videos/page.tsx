import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getStoreVideos } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { VideosForm } from "./videos-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Product videos", path: "/admin/store/videos", seo: noIndex });

/**
 * "Shop the videos" (0.140.0), a screen of its own under Store beside the
 * promo banners — the same shape and the same reason: the person running the
 * shop is the store manager, who cannot open Settings at all. The rows are
 * the `store_videos` settings group; `PATCH /admin/store/videos` reaches those
 * eleven keys under `role:store_manager` and no other. The videos themselves
 * are not edited here: they are on each product's Media tab.
 */
export default async function AdminStoreVideosPage() {
  await requireScreen();
  let data: Awaited<ReturnType<typeof getStoreVideos>>;
  try {
    data = await getStoreVideos();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Store managers only">
          The product videos are restricted to store manager and administrator
          accounts. Ask one to make the change, or to grant you the role.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the product videos">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Product videos"
        lede={<>
          A row of the shop&rsquo;s videos, each with its product under it — picture, name, price and an Add to basket
          button. The videos are the ones on each product&rsquo;s Media tab; this is where the row shows and how it plays.
        </>}
      />

      <VideosForm rows={data.rows} productsWithVideo={data.productsWithVideo} />
    </>
  );
}
