import { ErrorState } from "@/components/ui/empty";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getStoreTags, type AdminStoreTagList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { TagsManager } from "./tags-manager";

export const metadata = buildMetadata({ title: "Shop tags", path: "/admin/store/tags", seo: noIndex });

/**
 * Store → Tags (0.141.0): the coloured row under the shop's search bar. The
 * vocabulary is made on the product form (and by the automatic rule); this
 * screen is where it is tidied — hide one, put the ones that matter first,
 * rename, merge two spellings, delete — and where the row is switched off.
 */
export default async function AdminStoreTagsPage() {
  await requireScreen();
  let list: AdminStoreTagList;

  try {
    list = await getStoreTags();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Store managers only">
          Shop tags are restricted to store manager and administrator accounts.
        </ErrorState>
      );
    }

    return (
      <ErrorState title="We could not load the tags">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Shop tags"
        lede={<>
          Small coloured pills under the shop&apos;s search bar. A shopper presses one to see only the products
          that carry it. Tags are added on each product&apos;s form, or automatically the first time a product is
          saved; tidy them here.
        </>}
      />

      <TagsManager tags={list.data} meta={list.meta} />
    </>
  );
}
