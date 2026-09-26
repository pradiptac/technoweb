import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ApiError } from "@/lib/api";
import { getBlock } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminContentBlock } from "@/types/api";
import { PreviewFrame } from "../../../preview-frame";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Preview block", path: "/admin/blocks", seo: noIndex });

export default async function PreviewBlockPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requireScreen();
  const { id } = await params;

  let block: AdminContentBlock;
  try {
    ({ data: block } = await getBlock(Number(id)));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        back={{ href: `/admin/blocks/${block.type}/${block.id}`, label: "Back to the block" }}
        title={`Preview: ${block.name}`}
        lede="As the public site draws it, in the active theme. This is the saved version — save first to see a change."
      />
      <PreviewFrame blocks={[block]} />
    </>
  );
}
