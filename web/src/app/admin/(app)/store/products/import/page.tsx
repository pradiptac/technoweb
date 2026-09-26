import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StoreImportWizard } from "./import-wizard";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Import products", path: "/admin/store/products/import", seo: noIndex });

/**
 * The catalogue import: upload, map the columns and read what each line
 * would do, commit, done. The newsletter wizard's shape, because it is the
 * same job — a spreadsheet, a dry run that writes nothing, a commit of the
 * file that was approved.
 *
 * Nothing is fetched to draw it: the analysis carries the column list, so
 * the screen has nothing to load until a file is chosen.
 */
export default async function StoreImportPage() {
  await requireScreen();
  return (
    <>
      <PageHeader
        title="Import products"
        back={{ href: "/admin/store/products", label: "Store products" }}
        lede={<>
          A CSV or Excel file with a header row — the export from the products list is the
          right shape. Rows are matched by SKU: a matching product or variation is updated, an
          unmatched row becomes a new product. Nothing is written until the last step.
        </>}
      />

      <StoreImportWizard />
    </>
  );
}
