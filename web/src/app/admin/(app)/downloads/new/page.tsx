import { PageHeader } from "@/components/admin/page-header";
import { getDownloadOptions } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { DownloadForm } from "../download-form";

export const metadata = buildMetadata({ title: "New download", path: "/admin/downloads/new", seo: noIndex });

export default async function NewDownloadPage() {
  await requireScreen();
  const options = await getDownloadOptions();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/downloads", label: "All downloads" }}
        title="New download"
        lede="Name the file, choose where it is kept on the File tab, and attach it to the products it belongs to. It can be saved as a draft before its file is ready."
      />
      <DownloadForm options={options} />
    </>
  );
}
